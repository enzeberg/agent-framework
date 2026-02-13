import { OpenAICompatibleProvider } from './model-provider'
import { AnthropicProvider } from './anthropic-provider'
import type { IModelProvider, ModelRequest, ModelResponse, ModelSelectionCriteria, Complexity } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderName = 'openai' | 'anthropic' | 'gemini'

export interface ModelInfo {
  id: string
  name: string
  provider: ProviderName
  tier: 1 | 2 | 3
  contextWindow: number
  inputCostPer1M: number
  outputCostPer1M: number
}

export interface ProviderConfig {
  name: string
  apiKey?: string
  baseURL?: string
  models: string[]
  enabled: boolean
}

export interface ModelRouterConfig {
  defaultModel?: string
  fallbackModel?: string
  strategy: 'cost' | 'quality' | 'speed' | 'balanced'
  maxCostPerRequest: number
  providers?: ProviderConfig[]
}

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

/**
 * ModelRouter auto-detects available providers from environment variables,
 * selects models from the available pool, and dispatches LLM calls.
 *
 * Supported env vars:
 *   OPENAI_API_KEY    -> OpenAI models via OpenAI-compatible API
 *   ANTHROPIC_API_KEY -> Claude models via Anthropic Messages API
 *   GEMINI_API_KEY    -> Gemini models via Google's OpenAI-compatible endpoint
 */
export class ModelRouter {
  private config: ModelRouterConfig
  private modelRegistry: Map<string, ModelInfo> = new Map()
  private providerInstances: Map<ProviderName, IModelProvider> = new Map()
  private availableModels: ModelInfo[] = []
  private costTracker: Map<string, number> = new Map()

  constructor(config: ModelRouterConfig) {
    this.config = config
    this.initModelRegistry()
    this.initProviders()
    this.buildAvailableModels()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Whether at least one real LLM provider is available. */
  hasAvailableProviders(): boolean {
    return this.providerInstances.size > 0
  }

  /** Select the best available model based on criteria. */
  selectModel(criteria: ModelSelectionCriteria): string {
    if (this.availableModels.length === 0) {
      // No real provider — return a placeholder (mock mode).
      return this.config.defaultModel || 'mock'
    }

    const complexity = criteria.complexity || this.detectComplexity(criteria)
    const quality = criteria.qualityRequirement || 'medium'
    const cost = criteria.costConstraint || this.config.maxCostPerRequest

    if (complexity === 'complex' || quality === 'high') {
      return this.selectFromTier(1) || this.selectFromTier(2) || this.availableModels[0].id
    }

    if (cost < 0.01 || criteria.latencyRequirement === 'low') {
      return this.selectFromTier(3) || this.selectFromTier(2) || this.availableModels[0].id
    }

    return this.selectFromTier(2) || this.selectFromTier(1) || this.availableModels[0].id
  }

  /** Call the LLM provider that serves request.model. */
  async call(request: ModelRequest): Promise<ModelResponse> {
    const modelId = request.model || this.selectModel({ complexity: 'medium' })
    const modelInfo = this.modelRegistry.get(modelId)

    if (!modelInfo) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    const provider = this.providerInstances.get(modelInfo.provider)
    if (!provider) {
      throw new Error(
        `Provider "${modelInfo.provider}" is not available. ` +
        `Set ${this.envKeyForProvider(modelInfo.provider)} in your .env file.`
      )
    }

    return provider.call({ ...request, model: modelId })
  }

  /** Get the provider name string for the model (used by Agent for events). */
  getProviderName(modelId: string): string {
    const info = this.modelRegistry.get(modelId)
    return info?.provider || 'unknown'
  }

  estimateCost(tokens: number, model: string): number {
    const modelInfo = this.modelRegistry.get(model)
    if (!modelInfo) return 0
    return (tokens / 1_000_000) * modelInfo.inputCostPer1M
  }

  trackCost(model: string, cost: number): void {
    const current = this.costTracker.get(model) || 0
    this.costTracker.set(model, current + cost)
  }

  getTotalCost(): number {
    return Array.from(this.costTracker.values()).reduce((sum, c) => sum + c, 0)
  }

  getCostByModel(): Map<string, number> {
    return new Map(this.costTracker)
  }

  // -------------------------------------------------------------------------
  // Initialization helpers
  // -------------------------------------------------------------------------

  private initModelRegistry(): void {
    const models: ModelInfo[] = [
      // OpenAI
      { id: 'gpt-4o',            name: 'GPT-4o',            provider: 'openai',    tier: 1, contextWindow: 128000,  inputCostPer1M: 2.5,   outputCostPer1M: 10 },
      { id: 'gpt-4o-mini',       name: 'GPT-4o Mini',       provider: 'openai',    tier: 2, contextWindow: 128000,  inputCostPer1M: 0.15,  outputCostPer1M: 0.6 },
      { id: 'gpt-4',             name: 'GPT-4',             provider: 'openai',    tier: 1, contextWindow: 8192,    inputCostPer1M: 30,    outputCostPer1M: 60 },
      { id: 'gpt-3.5-turbo',     name: 'GPT-3.5 Turbo',     provider: 'openai',    tier: 3, contextWindow: 16384,   inputCostPer1M: 0.5,   outputCostPer1M: 1.5 },

      // Anthropic
      { id: 'claude-sonnet-4-20250514',       name: 'Claude Sonnet 4',       provider: 'anthropic', tier: 1, contextWindow: 200000, inputCostPer1M: 3,     outputCostPer1M: 15 },
      { id: 'claude-3-5-sonnet-20241022',     name: 'Claude 3.5 Sonnet',     provider: 'anthropic', tier: 1, contextWindow: 200000, inputCostPer1M: 3,     outputCostPer1M: 15 },
      { id: 'claude-3-5-haiku-20241022',      name: 'Claude 3.5 Haiku',      provider: 'anthropic', tier: 2, contextWindow: 200000, inputCostPer1M: 0.8,   outputCostPer1M: 4 },

      // Gemini (via Google's OpenAI-compatible endpoint)
      { id: 'gemini-2.0-flash',  name: 'Gemini 2.0 Flash',  provider: 'gemini',    tier: 2, contextWindow: 1048576, inputCostPer1M: 0.1,   outputCostPer1M: 0.4 },
      { id: 'gemini-1.5-pro',    name: 'Gemini 1.5 Pro',    provider: 'gemini',    tier: 1, contextWindow: 2097152, inputCostPer1M: 1.25,  outputCostPer1M: 5 },
      { id: 'gemini-1.5-flash',  name: 'Gemini 1.5 Flash',  provider: 'gemini',    tier: 3, contextWindow: 1048576, inputCostPer1M: 0.075, outputCostPer1M: 0.3 },
    ]

    for (const m of models) {
      this.modelRegistry.set(m.id, m)
    }
  }

  /**
   * Detect API keys from environment and instantiate providers.
   */
  private initProviders(): void {
    const openaiKey = process.env.OPENAI_API_KEY
    if (openaiKey) {
      this.providerInstances.set('openai', new OpenAICompatibleProvider({
        name: 'openai',
        apiKey: openaiKey,
        baseURL: 'https://api.openai.com/v1',
      }))
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (anthropicKey) {
      this.providerInstances.set('anthropic', new AnthropicProvider({
        name: 'anthropic',
        apiKey: anthropicKey,
      }))
    }

    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      this.providerInstances.set('gemini', new OpenAICompatibleProvider({
        name: 'gemini',
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      }))
    }
  }

  /**
   * Filter the full registry to only models whose provider is available.
   */
  private buildAvailableModels(): void {
    this.availableModels = []
    for (const model of this.modelRegistry.values()) {
      if (this.providerInstances.has(model.provider)) {
        this.availableModels.push(model)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  private selectFromTier(tier: 1 | 2 | 3): string | null {
    // Strategy-aware sorting within the tier
    const candidates = this.availableModels.filter(m => m.tier === tier)
    if (candidates.length === 0) return null

    switch (this.config.strategy) {
      case 'cost':
        candidates.sort((a, b) => a.inputCostPer1M - b.inputCostPer1M)
        break
      case 'quality':
        // Prefer higher-cost (usually higher quality) within the tier
        candidates.sort((a, b) => b.inputCostPer1M - a.inputCostPer1M)
        break
      case 'speed':
        // Prefer larger context window (newer, faster models) as proxy
        candidates.sort((a, b) => b.contextWindow - a.contextWindow)
        break
      default: // balanced — no preference, use first
        break
    }

    // If a defaultModel matches this tier, prefer it
    const preferred = this.config.defaultModel
    if (preferred) {
      const match = candidates.find(c => c.id === preferred)
      if (match) return match.id
    }

    return candidates[0].id
  }

  private detectComplexity(criteria: ModelSelectionCriteria): Complexity {
    if (criteria.taskType === 'reasoning') return 'complex'
    if (criteria.taskType === 'simple') return 'simple'
    if (criteria.estimatedTokens && criteria.estimatedTokens > 10000) return 'complex'
    return 'medium'
  }

  private envKeyForProvider(provider: ProviderName): string {
    const map: Record<ProviderName, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
    }
    return map[provider]
  }
}
