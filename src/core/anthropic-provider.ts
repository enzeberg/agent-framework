import type { IModelProvider, ModelRequest, ModelResponse, TokenUsage, ToolCall, ChatMessage } from '../types'

export interface AnthropicProviderConfig {
  name?: string
  /** API key (required) */
  apiKey: string
  defaultModel?: string
  defaultTemperature?: number
  maxRetries?: number
  timeout?: number
}

const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Anthropic Claude Messages API provider.
 *
 * NOTE: This class does NOT read from environment variables.
 * Environment detection is handled by ModelRouter.
 */
export class AnthropicProvider implements IModelProvider {
  name: string
  private apiKey: string
  private defaultModel: string
  private defaultTemperature: number
  private maxRetries: number
  private timeout: number

  constructor(config: AnthropicProviderConfig) {
    this.name = config.name || 'anthropic'
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel || 'claude-3-5-sonnet-20241022'
    this.defaultTemperature = config.defaultTemperature ?? 0.7
    this.maxRetries = config.maxRetries ?? 2
    this.timeout = config.timeout ?? 60_000
  }

  async call(request: ModelRequest): Promise<ModelResponse> {
    const model = request.model || this.defaultModel
    const { system, messages: anthropicMessages } = this.toAnthropicMessages(request.messages)

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens || 4096,
      system: system || undefined,
      messages: anthropicMessages,
      temperature: request.temperature ?? this.defaultTemperature,
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(body)
        return this.parseResponse(response, model)
      } catch (error) {
        lastError = error as Error
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt))
        }
      }
    }
    throw new Error(`Anthropic API failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`)
  }

  private toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: any[] } {
    let system: string | undefined
    const out: any[] = []
    let i = 0

    // Collect leading system message(s)
    const systemParts: string[] = []
    while (i < messages.length && messages[i].role === 'system') {
      const c = messages[i].content
      if (typeof c === 'string' && c.trim()) systemParts.push(c)
      i++
    }
    if (systemParts.length > 0) system = systemParts.join('\n\n')

    while (i < messages.length) {
      const msg = messages[i]
      if (msg.role === 'user') {
        out.push({ role: 'user' as const, content: msg.content ?? '' })
        i++
      } else if (msg.role === 'assistant') {
        const content = msg.tool_calls
          ? msg.tool_calls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.function.name,
              input: typeof tc.function.arguments === 'string' ? (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })() : tc.function.arguments,
            }))
          : (msg.content ?? '')
        out.push({ role: 'assistant' as const, content })
        i++
      } else if (msg.role === 'tool') {
        // Anthropic expects tool results as a "user" message with content = array of tool_result
        const toolResults = []
        while (i < messages.length && messages[i].role === 'tool') {
          const t = messages[i]
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: t.tool_call_id!,
            content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content),
          })
          i++
        }
        out.push({ role: 'user' as const, content: toolResults })
      } else {
        i++
      }
    }

    return { system, messages: out }
  }

  private async fetchWithTimeout(body: Record<string, unknown>): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${text}`)
      }
      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseResponse(data: any, model: string): ModelResponse {
    const usage = data.usage || {}
    const tokens: TokenUsage = {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    }

    const contentBlocks = data.content || []
    let content: string | null = null
    const toolCalls: ToolCall[] = []

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        content = (content ? content + '\n' : '') + (block.text || '')
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input || {}),
          },
        })
      }
    }

    let finishReason: ModelResponse['finishReason'] = 'stop'
    if (data.stop_reason === 'end_turn') finishReason = 'stop'
    else if (data.stop_reason === 'tool_use') finishReason = 'tool_calls'
    else if (data.stop_reason === 'max_tokens') finishReason = 'length'

    return {
      content: content || (toolCalls.length > 0 ? null : ''),
      model: data.model || model,
      tokens,
      cost: 0,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
