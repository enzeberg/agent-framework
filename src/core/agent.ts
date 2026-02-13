import { EventBus } from './event-bus'
import { Storage } from './storage'
import { ContextBuilder } from './context-builder'
import { ModelRouter } from './model-router'
import type { IComponent } from './component'
import type {
  AgentState, AgentEvent, Tool, TokenUsage,
  ChatMessage, ToolDefinition, ToolCall
} from '../types'

export interface AgentConfig {
  name: string
  components: IComponent[]
  modelRouter: ModelRouter
  tools?: Tool[]
  systemPrompt?: string
  maxTokens?: number
  /** Maximum tool-call loop iterations to prevent infinite loops */
  maxToolRounds?: number
  dbPath?: string
}

export class Agent {
  id: string
  name: string
  private state: AgentState = 'idle'
  private components: IComponent[]
  private eventBus: EventBus
  private storage: Storage
  private contextBuilder: ContextBuilder
  private modelRouter: ModelRouter
  private tools: Tool[]
  private toolMap: Map<string, Tool> = new Map()
  private maxToolRounds: number
  private tokenUsage: TokenUsage = { input: 0, output: 0, total: 0 }
  
  constructor(config: AgentConfig) {
    this.id = `agent-${Date.now()}`
    this.name = config.name
    this.components = config.components
    this.modelRouter = config.modelRouter
    this.tools = config.tools || []
    this.maxToolRounds = config.maxToolRounds ?? 10
    
    // Build tool lookup map
    for (const tool of this.tools) {
      this.toolMap.set(tool.name, tool)
    }
    
    this.eventBus = new EventBus()
    this.storage = new Storage({
      dbPath: config.dbPath || './agent.db',
      agentId: this.id
    })
    
    this.contextBuilder = new ContextBuilder({
      maxTokens: config.maxTokens || 8000,
      systemPrompt: config.systemPrompt || 'You are a helpful AI assistant.',
      budgetAllocation: {
        system: 0.1,
        memory: 0.2,
        history: 0.4,
        todo: 0.2,
        current: 0.1
      }
    })
  }
  
  async init(): Promise<void> {
    const context = {
      agent: this,
      eventBus: this.eventBus,
      storage: this.storage,
      logger: console
    }
    
    for (const component of this.components) {
      await component.init(context)
      this.emitEvent({
        type: 'component:initialized',
        component: component.name,
        timestamp: Date.now()
      })
    }
  }
  
  async execute(task: string): Promise<string> {
    await this.transitionTo('running')
    
    try {
      // If no real LLM provider is configured, fall back to mock
      if (!this.modelRouter.hasAvailableProviders()) {
        return await this.executeMock(task)
      }

      return await this.executeWithLLM(task)
    } catch (error) {
      this.emitEvent({
        type: 'error:occurred',
        error: error as Error,
        context: { task },
        timestamp: Date.now()
      })
      await this.transitionTo('failed')
      throw error
    }
  }

  /**
   * Real LLM execution with tool-calling loop.
   *
   * Flow:
   *   1. Build initial messages from context + task
   *   2. Call LLM (via ModelRouter) with messages + tool definitions
   *   3. If LLM returns tool_calls → execute each tool → append results → goto 2
   *   4. If LLM returns final text content → done
   */
  private async executeWithLLM(task: string): Promise<string> {

    // 1. Build initial messages
    const messages: ChatMessage[] = await this.contextBuilder.buildMessages(this.components, task)

    this.emitEvent({
      type: 'context:built',
      fragments: [],
      totalTokens: this.estimateTokens(messages.map(m => m.content || '').join('')),
      timestamp: Date.now()
    })

    // Build tool definitions for the LLM
    const toolDefs: ToolDefinition[] = this.tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }
    }))

    const model = this.modelRouter.selectModel({
      complexity: 'medium',
      qualityRequirement: 'medium'
    })

    // 2. Tool-calling loop
    for (let round = 0; round < this.maxToolRounds; round++) {
      this.emitEvent({
        type: 'llm:call_started',
        model,
        provider: this.modelRouter.getProviderName(model),
        timestamp: Date.now()
      })

      const response = await this.modelRouter.call({
        messages,
        model,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
      })

      // Track tokens
      this.tokenUsage.input += response.tokens.input
      this.tokenUsage.output += response.tokens.output
      this.tokenUsage.total += response.tokens.total

      const cost = this.modelRouter.estimateCost(response.tokens.total, model)
      this.modelRouter.trackCost(model, cost)

      this.emitEvent({
        type: 'llm:call_completed',
        model,
        tokens: response.tokens,
        cost,
        timestamp: Date.now()
      })

      // 3. Check if LLM wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Append assistant message with tool_calls
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        })

        // Execute each tool call and append results
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall)
          messages.push({
            role: 'tool',
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          })
        }

        // Continue the loop — LLM will see the tool results
        continue
      }

      // 4. No tool calls → final answer
      const finalContent = response.content || ''
      await this.transitionTo('completed')
      return finalContent
    }

    // Safety: exceeded max rounds
    await this.transitionTo('completed')
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    return lastAssistant?.content || '[Agent reached maximum tool-call rounds]'
  }

  /**
   * Execute a single tool call and emit events.
   */
  private async executeTool(toolCall: ToolCall): Promise<any> {
    const toolName = toolCall.function.name
    const tool = this.toolMap.get(toolName)

    if (!tool) {
      const errorMsg = `Tool not found: ${toolName}`
      this.emitEvent({
        type: 'tool:executed',
        tool: toolName,
        input: toolCall.function.arguments,
        output: { error: errorMsg },
        duration: 0,
        timestamp: Date.now()
      })
      return JSON.stringify({ error: errorMsg })
    }

    let input: any
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch {
      input = toolCall.function.arguments
    }

    const startTime = Date.now()

    try {
      const output = await tool.execute(input)
      const duration = Date.now() - startTime

      this.emitEvent({
        type: 'tool:executed',
        tool: toolName,
        input,
        output,
        duration,
        timestamp: Date.now()
      })

      return output
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)

      this.emitEvent({
        type: 'tool:executed',
        tool: toolName,
        input,
        output: { error: errorMsg },
        duration,
        timestamp: Date.now()
      })

      return JSON.stringify({ error: errorMsg })
    }
  }

  /**
   * Mock execution (backward compatible, for testing without API key).
   */
  private async executeMock(task: string): Promise<string> {
    const context = await this.contextBuilder.build(this.components, task)

    this.emitEvent({
      type: 'context:built',
      fragments: [],
      totalTokens: this.estimateTokens(context),
      timestamp: Date.now()
    })

    const model = this.modelRouter.selectModel({
      complexity: 'medium',
      qualityRequirement: 'medium'
    })

    this.emitEvent({
      type: 'llm:call_started',
      model,
      provider: 'mock',
      timestamp: Date.now()
    })

    const result = `[Mock] Response for: ${task}`

    const tokens: TokenUsage = {
      input: this.estimateTokens(context),
      output: this.estimateTokens(result),
      total: this.estimateTokens(context) + this.estimateTokens(result)
    }

    this.tokenUsage.input += tokens.input
    this.tokenUsage.output += tokens.output
    this.tokenUsage.total += tokens.total

    const cost = this.modelRouter.estimateCost(tokens.total, model)
    this.modelRouter.trackCost(model, cost)

    this.emitEvent({
      type: 'llm:call_completed',
      model,
      tokens,
      cost,
      timestamp: Date.now()
    })

    await this.transitionTo('completed')
    return result
  }
  
  async pause(): Promise<void> {
    await this.transitionTo('paused')
  }
  
  async resume(): Promise<void> {
    await this.transitionTo('running')
  }
  
  async stop(): Promise<void> {
    await this.transitionTo('completed')
    await this.destroy()
  }
  
  private async transitionTo(newState: AgentState): Promise<void> {
    const oldState = this.state
    this.state = newState
    
    this.emitEvent({
      type: 'lifecycle:state_changed',
      from: oldState,
      to: newState,
      timestamp: Date.now()
    })
    
    await this.storage.saveAgentState({ state: newState })
  }
  
  private emitEvent(event: AgentEvent): void {
    this.eventBus.emit(event)
    this.storage.saveEvent(event)
  }
  
  on(eventType: string, handler: (event: AgentEvent) => void): void {
    this.eventBus.on(eventType, handler)
  }
  
  getState(): AgentState {
    return this.state
  }
  
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage }
  }
  
  getCost(): number {
    return this.modelRouter.getTotalCost()
  }
  
  async takeSnapshot(): Promise<any> {
    return this.storage.exportState()
  }
  
  async restoreSnapshot(snapshot: any): Promise<void> {
    this.storage.importState(snapshot)
  }
  
  private async destroy(): Promise<void> {
    for (const component of this.components) {
      await component.destroy()
    }
    this.storage.close()
  }
  
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }
}
