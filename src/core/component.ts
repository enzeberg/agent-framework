import type { AgentEvent, ComponentContext, ComponentState, ContextFragment, TokenBudget } from '../types'

export interface IComponent {
  name: string
  version: string
  dependencies: string[]
  
  init(context: ComponentContext): Promise<void>
  destroy(): Promise<void>
  getState(): ComponentState
  setState(state: ComponentState): void
  onEvent(event: AgentEvent): Promise<void>
  renderContext(budget: TokenBudget): Promise<ContextFragment>
}

export abstract class BaseComponent implements IComponent {
  abstract name: string
  abstract version: string
  dependencies: string[] = []
  
  protected context!: ComponentContext
  protected state: ComponentState = {}
  
  async init(context: ComponentContext): Promise<void> {
    this.context = context
    await this.loadState()
  }
  
  async destroy(): Promise<void> {
    await this.saveState()
  }
  
  getState(): ComponentState {
    return this.state
  }
  
  setState(state: ComponentState): void {
    this.state = state
  }
  
  abstract onEvent(event: AgentEvent): Promise<void>
  abstract renderContext(budget: TokenBudget): Promise<ContextFragment>
  
  protected async loadState(): Promise<void> {
    const saved = await this.context.storage.get(this.name)
    if (saved) {
      this.state = saved
    }
  }
  
  protected async saveState(): Promise<void> {
    await this.context.storage.set(this.name, this.state)
  }
  
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }
  
  protected emit(event: Omit<AgentEvent, 'timestamp'>): void {
    this.context.eventBus.emit({
      ...event,
      timestamp: Date.now()
    } as AgentEvent)
  }
}
