import { BaseComponent } from '../core/component'
import type { AgentEvent, ContextFragment, TokenBudget, Message } from '../types'

export interface WorkingHistoryConfig {
  maxMessages?: number
  maxTokens?: number
  compressionThreshold?: number
  keepRecentCount?: number
}

interface WorkingHistoryState {
  messages: Message[]
  totalTokens: number
  compressionCount: number
}

export class WorkingHistory extends BaseComponent {
  name = 'working-history'
  version = '1.0.0'
  
  private config: Required<WorkingHistoryConfig>
  
  constructor(config: WorkingHistoryConfig = {}) {
    super()
    this.config = {
      maxMessages: config.maxMessages ?? 50,
      maxTokens: config.maxTokens ?? 4000,
      compressionThreshold: config.compressionThreshold ?? 30,
      keepRecentCount: config.keepRecentCount ?? 10
    }
    
    this.state = {
      messages: [],
      totalTokens: 0,
      compressionCount: 0
    }
  }
  
  async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'llm:call_completed') {
      // Track messages would go here
    }
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    const state = this.state as WorkingHistoryState
    let content = '## Conversation History\n\n'
    let tokens = 0
    const allocated = budget.allocated || budget.history
    
    const messages = state.messages.slice(-this.config.keepRecentCount)
    
    for (const message of messages) {
      if (tokens + message.tokens > allocated) break
      
      content += `${message.role}: ${message.content}\n\n`
      tokens += message.tokens
    }
    
    return { content, tokens, priority: 8 }
  }
  
  addMessage(message: Omit<Message, 'id' | 'timestamp' | 'tokens'>): void {
    const state = this.state as WorkingHistoryState
    const fullMessage: Message = {
      ...message,
      id: `msg-${Date.now()}`,
      timestamp: Date.now(),
      tokens: this.estimateTokens(message.content)
    }
    
    state.messages.push(fullMessage)
    state.totalTokens += fullMessage.tokens
    
    if (state.messages.length > this.config.compressionThreshold) {
      this.compress()
    }
    
    this.emit({
      type: 'component:state_updated',
      component: this.name,
      state: this.state
    })
  }
  
  private compress(): void {
    const state = this.state as WorkingHistoryState
    const recent = state.messages.slice(-this.config.keepRecentCount)
    const important = state.messages.filter(m => m.important)
    
    state.messages = [...important, ...recent]
    state.compressionCount++
  }
  
  getMessages(): Message[] {
    return (this.state as WorkingHistoryState).messages
  }
}
