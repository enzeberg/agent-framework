// Core exports
export { Agent } from './core/agent'
export type { AgentConfig } from './core/agent'
export { EventBus } from './core/event-bus'
export { Storage } from './core/storage'
export { ContextBuilder } from './core/context-builder'
export { ModelRouter } from './core/model-router'
export type { ModelRouterConfig, ProviderConfig, ModelInfo, ProviderName } from './core/model-router'
export { BaseComponent } from './core/component'
export type { IComponent } from './core/component'

// Model Provider exports (for advanced usage / custom providers)
export { OpenAICompatibleProvider } from './core/model-provider'
export type { ModelProviderConfig } from './core/model-provider'
export { AnthropicProvider } from './core/anthropic-provider'
export type { AnthropicProviderConfig } from './core/anthropic-provider'

// Component exports
export { WorkingHistory } from './components/working-history'
export { Memory } from './components/memory'
export { Todo } from './components/todo'
export { SubAgent } from './components/sub-agent'

// Type exports
export type {
  AgentState,
  AgentEvent,
  TokenUsage,
  ContextFragment,
  TokenBudget,
  ComponentState,
  ChatMessage,
  Message,
  Task,
  Tool,
  ToolDefinition,
  ToolCall,
  IModelProvider,
  ModelRequest,
  ModelResponse,
  ModelSelectionCriteria
} from './types'
