import { BaseComponent } from '../core/component'
import type { Agent } from '../core/agent'
import type { AgentEvent, ContextFragment, TokenBudget, AgentState } from '../types'

export interface SubAgentConfig {
  maxConcurrent?: number
  timeout?: number
  shareTools?: boolean
}

interface SubAgentInfo {
  id: string
  task: string
  status: AgentState
  createdAt: number
  agent: Agent
}

interface SubAgentResult {
  id: string
  task: string
  result: any
  error: Error | null
  duration: number
  tokensUsed: number
  cost: number
}

interface SubAgentState {
  activeSubAgents: Map<string, SubAgentInfo>
  completedSubAgents: SubAgentResult[]
  failedSubAgents: SubAgentResult[]
}

export class SubAgent extends BaseComponent {
  name = 'sub-agent'
  version = '1.0.0'
  
  private config: Required<SubAgentConfig>
  
  constructor(config: SubAgentConfig = {}) {
    super()
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      timeout: config.timeout ?? 300000,
      shareTools: config.shareTools ?? true
    }
    
    this.state = {
      activeSubAgents: new Map(),
      completedSubAgents: [],
      failedSubAgents: []
    }
  }
  
  async onEvent(event: AgentEvent): Promise<void> {
    // Handle subagent events
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    const state = this.state as SubAgentState
    let content = '## SubAgent Status\n\n'
    let tokens = 0
    
    if (state.activeSubAgents.size > 0) {
      content += `### Active (${state.activeSubAgents.size})\n`
      for (const [id, info] of state.activeSubAgents) {
        const line = `- ${info.task} (${info.status})\n`
        tokens += this.estimateTokens(line)
        content += line
      }
      content += '\n'
    }
    
    const recent = state.completedSubAgents.slice(-3)
    if (recent.length > 0) {
      content += `### Recently Completed\n`
      for (const result of recent) {
        const line = `- ${result.task} (${result.duration}ms)\n`
        tokens += this.estimateTokens(line)
        content += line
      }
    }
    
    return { content, tokens, priority: 5 }
  }
  
  async createSubAgent(task: string): Promise<string> {
    const state = this.state as SubAgentState
    
    if (state.activeSubAgents.size >= this.config.maxConcurrent) {
      throw new Error('Max concurrent subagents reached')
    }
    
    const id = `subagent-${Date.now()}`
    
    // In a real implementation, would create actual Agent instance
    const info: SubAgentInfo = {
      id,
      task,
      status: 'idle',
      createdAt: Date.now(),
      agent: null as any
    }
    
    state.activeSubAgents.set(id, info)
    
    return id
  }
  
  async executeSubAgent(id: string, task: string): Promise<SubAgentResult> {
    const state = this.state as SubAgentState
    const info = state.activeSubAgents.get(id)
    
    if (!info) {
      throw new Error(`SubAgent ${id} not found`)
    }
    
    const startTime = Date.now()
    
    try {
      // Mock execution
      const result = `SubAgent result for: ${task}`
      const duration = Date.now() - startTime
      
      const subAgentResult: SubAgentResult = {
        id,
        task,
        result,
        error: null,
        duration,
        tokensUsed: 100,
        cost: 0.001
      }
      
      state.completedSubAgents.push(subAgentResult)
      state.activeSubAgents.delete(id)
      
      return subAgentResult
    } catch (error) {
      const duration = Date.now() - startTime
      
      const subAgentResult: SubAgentResult = {
        id,
        task,
        result: null,
        error: error as Error,
        duration,
        tokensUsed: 0,
        cost: 0
      }
      
      state.failedSubAgents.push(subAgentResult)
      state.activeSubAgents.delete(id)
      
      throw error
    }
  }
  
  async executeParallel(tasks: string[]): Promise<SubAgentResult[]> {
    const subAgentIds = await Promise.all(
      tasks.map(task => this.createSubAgent(task))
    )
    
    const results = await Promise.all(
      subAgentIds.map((id, i) => this.executeSubAgent(id, tasks[i]))
    )
    
    return results
  }
}
