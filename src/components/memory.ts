import { BaseComponent } from '../core/component'
import type { AgentEvent, ContextFragment, TokenBudget } from '../types'

export interface MemoryConfig {
  maxSummaries?: number
  compressionInterval?: number
  retrievalCount?: number
}

interface Summary {
  id: string
  content: string
  sourceMessages: string[]
  timestamp: number
  tokens: number
  importance: number
}

interface Fact {
  id: string
  content: string
  confidence: number
  source: string
  timestamp: number
  category: string
}

interface MemoryState {
  summaries: Summary[]
  facts: Fact[]
  lastCompression: number
  messageCount: number
}

export class Memory extends BaseComponent {
  name = 'memory'
  version = '1.0.0'
  
  private config: Required<MemoryConfig>
  
  constructor(config: MemoryConfig = {}) {
    super()
    this.config = {
      maxSummaries: config.maxSummaries ?? 20,
      compressionInterval: config.compressionInterval ?? 20,
      retrievalCount: config.retrievalCount ?? 5
    }
    
    this.state = {
      summaries: [],
      facts: [],
      lastCompression: 0,
      messageCount: 0
    }
  }
  
  async onEvent(event: AgentEvent): Promise<void> {
    const state = this.state as MemoryState
    
    if (event.type === 'llm:call_completed') {
      state.messageCount++
      
      if (state.messageCount - state.lastCompression >= this.config.compressionInterval) {
        await this.compress()
      }
    }
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    const state = this.state as MemoryState
    let content = '## Long-term Memory\n\n'
    let tokens = 0
    const allocated = budget.allocated || budget.memory
    
    for (const summary of state.summaries.slice(-5)) {
      if (tokens + summary.tokens > allocated) break
      content += `- ${summary.content}\n`
      tokens += summary.tokens
    }
    
    const highConfidenceFacts = state.facts.filter(f => f.confidence > 0.8).slice(-5)
    if (highConfidenceFacts.length > 0) {
      content += '\n## Key Facts\n\n'
      for (const fact of highConfidenceFacts) {
        const factTokens = this.estimateTokens(fact.content)
        if (tokens + factTokens > allocated) break
        content += `- ${fact.content}\n`
        tokens += factTokens
      }
    }
    
    return { content, tokens, priority: 6 }
  }
  
  private async compress(): Promise<void> {
    const state = this.state as MemoryState
    
    const summary: Summary = {
      id: `summary-${Date.now()}`,
      content: 'Summary of recent interactions',
      sourceMessages: [],
      timestamp: Date.now(),
      tokens: 50,
      importance: 0.8
    }
    
    state.summaries.push(summary)
    state.lastCompression = state.messageCount
    
    if (state.summaries.length > this.config.maxSummaries) {
      state.summaries.shift()
    }
  }
  
  addFact(fact: Omit<Fact, 'id' | 'timestamp'>): void {
    const state = this.state as MemoryState
    state.facts.push({
      ...fact,
      id: `fact-${Date.now()}`,
      timestamp: Date.now()
    })
  }
}
