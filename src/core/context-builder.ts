import type { IComponent } from './component'
import type { ContextFragment, TokenBudget } from '../types'

export interface ContextBuilderConfig {
  maxTokens: number
  systemPrompt: string
  budgetAllocation: {
    system: number
    memory: number
    history: number
    todo: number
    current: number
  }
}

export class ContextBuilder {
  private config: ContextBuilderConfig
  
  constructor(config: ContextBuilderConfig) {
    this.config = config
  }
  
  async build(components: IComponent[], currentTask: string): Promise<string> {
    const budget = this.calculateBudget()
    const fragments: ContextFragment[] = []
    
    fragments.push({
      content: this.config.systemPrompt,
      tokens: budget.system,
      priority: 10
    })
    
    for (const component of components) {
      const componentBudget = this.getComponentBudget(component.name, budget)
      if (componentBudget > 0) {
        const fragment = await component.renderContext({ ...budget, allocated: componentBudget })
        fragments.push(fragment)
      }
    }
    
    fragments.push({
      content: `\n## Current Task\n${currentTask}`,
      tokens: budget.current,
      priority: 9
    })
    
    return this.assembleContext(fragments, budget)
  }
  
  private calculateBudget(): TokenBudget {
    const total = this.config.maxTokens
    const alloc = this.config.budgetAllocation
    
    return {
      total,
      system: Math.floor(total * alloc.system),
      memory: Math.floor(total * alloc.memory),
      history: Math.floor(total * alloc.history),
      todo: Math.floor(total * alloc.todo),
      current: Math.floor(total * alloc.current)
    }
  }
  
  private getComponentBudget(componentName: string, budget: TokenBudget): number {
    const mapping: Record<string, keyof TokenBudget> = {
      'memory': 'memory',
      'working-history': 'history',
      'todo': 'todo'
    }
    
    const key = mapping[componentName]
    return key ? budget[key] : 0
  }
  
  private assembleContext(fragments: ContextFragment[], budget: TokenBudget): string {
    fragments.sort((a, b) => b.priority - a.priority)
    
    let totalTokens = 0
    const selected: ContextFragment[] = []
    
    for (const fragment of fragments) {
      if (totalTokens + fragment.tokens <= budget.total) {
        selected.push(fragment)
        totalTokens += fragment.tokens
      }
    }
    
    return selected.map(f => f.content).join('\n\n')
  }
}
