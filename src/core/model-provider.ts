import type { IModelProvider, ModelRequest, ModelResponse, TokenUsage, ToolCall } from '../types'

export interface ModelProviderConfig {
  /** Provider name for logging/events */
  name?: string
  /** API key (required) */
  apiKey: string
  /** Base URL for the API endpoint (required) */
  baseURL: string
  /** Default model to use */
  defaultModel?: string
  /** Default temperature */
  defaultTemperature?: number
  /** Maximum retries on failure */
  maxRetries?: number
  /** Timeout in milliseconds */
  timeout?: number
}

/**
 * OpenAI-compatible model provider.
 * Works with OpenAI, DeepSeek, Moonshot, Together, OpenRouter, Gemini,
 * and any other API that follows the OpenAI chat completions format.
 *
 * NOTE: This class does NOT read from environment variables.
 * Environment detection is handled by ModelRouter.
 */
export class OpenAICompatibleProvider implements IModelProvider {
  name: string
  private apiKey: string
  private baseURL: string
  private defaultModel: string
  private defaultTemperature: number
  private maxRetries: number
  private timeout: number

  constructor(config: ModelProviderConfig) {
    this.name = config.name || 'openai-compatible'
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL.replace(/\/$/, '')
    this.defaultModel = config.defaultModel || 'gpt-3.5-turbo'
    this.defaultTemperature = config.defaultTemperature ?? 0.7
    this.maxRetries = config.maxRetries ?? 2
    this.timeout = config.timeout ?? 60_000
  }

  async call(request: ModelRequest): Promise<ModelResponse> {
    const model = request.model || this.defaultModel
    const body: Record<string, any> = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? this.defaultTemperature,
    }

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools
      body.tool_choice = 'auto'
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(body)
        return this.parseResponse(response, model)
      } catch (error) {
        lastError = error as Error
        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s...
          await this.sleep(1000 * Math.pow(2, attempt))
        }
      }
    }

    throw new Error(`LLM call failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`)
  }

  private async fetchWithTimeout(body: Record<string, any>): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`LLM API error (${response.status}): ${errorBody}`)
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseResponse(data: any, model: string): ModelResponse {
    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('No choices in LLM response')
    }

    const message = choice.message
    const usage = data.usage || {}

    const tokens: TokenUsage = {
      input: usage.prompt_tokens || 0,
      output: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
    }

    // Parse tool calls if present
    let toolCalls: ToolCall[] | undefined
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
    }

    // Map finish_reason
    let finishReason: ModelResponse['finishReason'] = 'stop'
    if (choice.finish_reason === 'tool_calls') {
      finishReason = 'tool_calls'
    } else if (choice.finish_reason === 'length') {
      finishReason = 'length'
    } else if (choice.finish_reason === 'content_filter') {
      finishReason = 'content_filter'
    }

    return {
      content: message.content || null,
      model: data.model || model,
      tokens,
      cost: 0, // Cost will be calculated by ModelRouter
      toolCalls,
      finishReason,
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
