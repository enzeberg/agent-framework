// Core types for the agent framework

export type AgentState = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export type AgentEvent =
  | { type: 'lifecycle:state_changed'; from: AgentState; to: AgentState; timestamp: number }
  | { type: 'component:initialized'; component: string; timestamp: number }
  | { type: 'component:state_updated'; component: string; state: any; timestamp: number }
  | { type: 'llm:call_started'; model: string; provider: string; timestamp: number }
  | { type: 'llm:call_completed'; model: string; tokens: TokenUsage; cost: number; timestamp: number }
  | { type: 'tool:executed'; tool: string; input: any; output: any; timestamp: number }
  | { type: 'context:built'; fragments: ContextFragment[]; totalTokens: number; timestamp: number }
  | { type: 'error:occurred'; error: Error; context: any; timestamp: number }

export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface ContextFragment {
  content: string
  tokens: number
  priority: number
}

export interface TokenBudget {
  total: number
  system: number
  memory: number
  history: number
  todo: number
  current: number
  allocated?: number
}

export interface ComponentState {
  [key: string]: any
}

export interface ComponentContext {
  agent: any
  eventBus: any
  storage: any
  logger: any
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokens: number
  important: boolean
  metadata?: Record<string, any>
}

export interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  priority: number
  dependencies: string[]
  subtasks: string[]
  parentTask: string | null
  estimatedTokens: number
  actualTokens: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
  metadata: Record<string, any>
}

export interface Tool {
  name: string
  description: string
  inputSchema: any
  execute(input: any): Promise<any>
}

export interface LLMRequest {
  prompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: Tool[]
}

export interface LLMResponse {
  content: string
  model: string
  tokens: TokenUsage
  cost: number
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  input: any
}

export type Complexity = 'simple' | 'medium' | 'complex'
export type Quality = 'low' | 'medium' | 'high'
export type Latency = 'low' | 'medium' | 'high'

export interface ModelSelectionCriteria {
  taskType?: 'generation' | 'analysis' | 'reasoning' | 'simple'
  estimatedTokens?: number
  complexity?: Complexity
  qualityRequirement?: Quality
  latencyRequirement?: Latency
  costConstraint?: number
  previousAttempts?: number
  availableBudget?: number
}
