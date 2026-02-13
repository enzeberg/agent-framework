import { BaseComponent } from '../core/component'
import type { AgentEvent, ContextFragment, TokenBudget, Task } from '../types'

export interface TodoConfig {
  maxTasks?: number
  maxDepth?: number
  autoDecompose?: boolean
}

interface TodoState {
  tasks: Task[]
  currentTask: string | null
  completedTasks: string[]
  failedTasks: string[]
}

export class Todo extends BaseComponent {
  name = 'todo'
  version = '1.0.0'
  
  private config: Required<TodoConfig>
  
  constructor(config: TodoConfig = {}) {
    super()
    this.config = {
      maxTasks: config.maxTasks ?? 100,
      maxDepth: config.maxDepth ?? 3,
      autoDecompose: config.autoDecompose ?? true
    }
    
    this.state = {
      tasks: [],
      currentTask: null,
      completedTasks: [],
      failedTasks: []
    }
  }
  
  async onEvent(event: AgentEvent): Promise<void> {
    // Handle task-related events
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    const state = this.state as TodoState
    let content = '## Task List\n\n'
    let tokens = 0
    const allocated = budget.allocated || budget.todo
    
    if (state.currentTask) {
      const task = this.getTask(state.currentTask)
      if (task) {
        content += `### Current Task\n**${task.title}** (Priority: ${task.priority})\n${task.description}\n\n`
        tokens += this.estimateTokens(task.title + task.description)
      }
    }
    
    const pending = state.tasks.filter(t => t.status === 'pending').slice(0, 5)
    if (pending.length > 0) {
      content += `### Pending Tasks (${pending.length})\n`
      for (const task of pending) {
        const taskLine = `- [ ] ${task.title} (P${task.priority})\n`
        const taskTokens = this.estimateTokens(taskLine)
        if (tokens + taskTokens > allocated) break
        content += taskLine
        tokens += taskTokens
      }
    }
    
    return { content, tokens, priority: 7 }
  }
  
  async addTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>): Promise<string> {
    const state = this.state as TodoState
    const id = `task-${Date.now()}`
    
    const fullTask: Task = {
      ...task,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null
    }
    
    state.tasks.push(fullTask)
    
    this.emit({
      type: 'component:state_updated',
      component: this.name,
      state: this.state
    } as Omit<Extract<AgentEvent, { type: 'component:state_updated' }>, 'timestamp'>)
    
    return id
  }
  
  async updateTaskStatus(taskId: string, status: Task['status']): Promise<void> {
    const state = this.state as TodoState
    const task = state.tasks.find(t => t.id === taskId)
    
    if (task) {
      task.status = status
      task.updatedAt = Date.now()
      
      if (status === 'completed') {
        task.completedAt = Date.now()
        state.completedTasks.push(taskId)
        if (state.currentTask === taskId) {
          state.currentTask = null
        }
      } else if (status === 'failed') {
        state.failedTasks.push(taskId)
        if (state.currentTask === taskId) {
          state.currentTask = null
        }
      } else if (status === 'in_progress') {
        state.currentTask = taskId
      }
      
      this.emit({
        type: 'component:state_updated',
        component: this.name,
        state: this.state
      } as Omit<Extract<AgentEvent, { type: 'component:state_updated' }>, 'timestamp'>)
    }
  }
  
  getNextTask(): Task | null {
    const state = this.state as TodoState
    const pending = state.tasks.filter(t => t.status === 'pending')
    
    for (const task of pending) {
      const dependencies = task.dependencies.map(id => this.getTask(id))
      const allCompleted = dependencies.every(d => d?.status === 'completed')
      
      if (allCompleted) {
        return task
      }
    }
    
    return null
  }
  
  getTask(taskId: string): Task | undefined {
    const state = this.state as TodoState
    return state.tasks.find(t => t.id === taskId)
  }
  
  getTasks(): Task[] {
    return (this.state as TodoState).tasks
  }
}
