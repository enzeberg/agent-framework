import type { LLMRequest, LLMResponse, ModelSelectionCriteria, Complexity } from '../types'

export interface ModelInfo {
  id: string
  name: string
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
  defaultModel: string
  fallbackModel: string
  strategy: 'cost' | 'quality' | 'speed' | 'balanced'
  maxCostPerRequest: number
  providers: ProviderConfig[]
}

export class ModelRouter {
  private config: ModelRouterConfig
  private modelRegistry: Map<string, ModelInfo> = new Map()
  private costTracker: Map<string, number> = new Map()
  
  constructor(config: ModelRouterConfig) {
    this.config = config
    this.initModelRegistry()
  }
  
  private initModelRegistry(): void {
    const models: ModelInfo[] = [
      { id: 'gpt-4', name: 'GPT-4', tier: 1, contextWindow: 8192, inputCostPer1M: 30, outputCostPer1M: 60 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', tier: 2, contextWindow: 16384, inputCostPer1M: 0.5, outputCostPer1M: 1.5 },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', tier: 1, contextWindow: 200000, inputCostPer1M: 15, outputCostPer1M: 75 },
      { id: 'claude-3-sonnet', name: 'Claude 3.5 Sonnet', tier: 1, contextWindow: 200000, inputCostPer1M: 3, outputCostPer1M: 15 },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', tier: 2, contextWindow: 200000, inputCostPer1M: 0.25, outputCostPer1M: 1.25 }
    ]
    
    for (const model of models) {
      this.modelRegistry.set(model.id, model)
    }
  }
  
  selectModel(criteria: ModelSelectionCriteria): string {
    const complexity = criteria.complexity || this.detectComplexity(criteria)
    const quality = criteria.qualityRequirement || 'medium'
    const cost = criteria.costConstraint || this.config.maxCostPerRequest
    
    if (complexity === 'complex' || quality === 'high') {
      return this.selectTier1Model()
    }
    
    if (cost < 0.01 || criteria.latencyRequirement === 'low') {
      return this.selectTier3Model()
    }
    
    return this.selectTier2Model()
  }
  
  private detectComplexity(criteria: ModelSelectionCriteria): Complexity {
    if (criteria.taskType === 'reasoning') return 'complex'
    if (criteria.taskType === 'simple') return 'simple'
    if (criteria.estimatedTokens && criteria.estimatedTokens > 10000) return 'complex'
    return 'medium'
  }
  
  private selectTier1Model(): string {
    return 'claude-3-sonnet'
  }
  
  private selectTier2Model(): string {
    return this.config.defaultModel
  }
  
  private selectTier3Model(): string {
    return this.config.fallbackModel
  }
  
  estimateCost(tokens: number, model: string): number {
    const modelInfo = this.modelRegistry.get(model)
    if (!modelInfo) return 0
    
    const inputCost = (tokens / 1_000_000) * modelInfo.inputCostPer1M
    return inputCost
  }
  
  trackCost(model: string, cost: number): void {
    const current = this.costTracker.get(model) || 0
    this.costTracker.set(model, current + cost)
  }
  
  getTotalCost(): number {
    return Array.from(this.costTracker.values()).reduce((sum, cost) => sum + cost, 0)
  }
  
  getCostByModel(): Map<string, number> {
    return new Map(this.costTracker)
  }
}
