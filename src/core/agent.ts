import { EventBus } from './event-bus'
import { Storage } from './storage'
import { ContextBuilder } from './context-builder'
import { ModelRouter } from './model-router'
import type { IComponent } from './component'
import type { AgentState, AgentEvent, Tool, TokenUsage } from '../types'

export interface AgentConfig {
  name: string
  components: IComponent[]
  modelRouter: ModelRouter
  tools?: Tool[]
  systemPrompt?: string
  maxTokens?: number
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
  private tokenUsage: TokenUsage = { input: 0, output: 0, total: 0 }
  
  constructor(config: AgentConfig) {
    this.id = `agent-${Date.now()}`
    this.name = config.name
    this.components = config.components
    this.modelRouter = config.modelRouter
    this.tools = config.tools || []
    
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
  
  async execute(task: string): Promise<any> {
    await this.transitionTo('running')
    
    try {
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
      
      const result = `Mock response for: ${task}`
      
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
