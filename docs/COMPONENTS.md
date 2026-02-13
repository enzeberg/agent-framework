# Component Guide

## Overview

Components are self-contained modules that extend agent functionality. Each component maintains its own state, responds to events, and contributes to the LLM context.

**Implementation:** All components extend `BaseComponent` from `src/core/component.ts`

## Component Interface

Every component must implement:
- `name` and `version`: Component identification
- `dependencies`: List of required components
- `init()`: Initialize with agent context
- `destroy()`: Cleanup resources
- `getState()` / `setState()`: State management
- `onEvent()`: Handle agent events
- `renderContext()`: Contribute to LLM prompt

**Key Concepts:**
- Components are independent and composable
- State is persisted automatically to SQLite
- Events enable loose coupling between components
- Token budget controls context contribution

## Built-in Components

### 1. WorkingHistory

Manages conversation and operation history with intelligent compression.

**Configuration Options:**
- `maxMessages`: Maximum messages to keep (default: 50)
- `maxTokens`: Maximum tokens for history (default: 4000)
- `compressionThreshold`: Trigger compression after N messages (default: 30)
- `keepRecentCount`: Always keep recent N messages (default: 10)

**Key Features:**
- Tracks all messages (user, assistant, system)
- Marks important messages for permanent retention
- Automatic compression when threshold reached
- Sliding window keeps recent messages

**Context Rendering Strategy:**
- Allocates 40% of total token budget
- Keeps recent N messages
- Always includes important messages
- Compresses older messages via summarization

**Usage Example:**
```typescript
const history = new WorkingHistory({
  maxMessages: 100,
  compressionThreshold: 50
})

// Add message
history.addMessage({
  role: 'user',
  content: 'Hello!',
  important: false
})

// Get all messages
const messages = history.getMessages()
```

**Implementation:** `src/components/working-history.ts`

### 2. Memory

Long-term memory with summarization and fact extraction.

**Configuration Options:**
- `maxSummaries`: Maximum summaries to keep (default: 20)
- `compressionInterval`: Summarize every N messages (default: 20)
- `embeddingEnabled`: Enable semantic search (default: false)
- `embeddingModel`: Model for embeddings (default: 'text-embedding-3-small')
- `retrievalCount`: Number of items to retrieve (default: 5)

**Key Features:**
- Periodic summarization of conversations
- Fact extraction with confidence scores
- Optional semantic search via embeddings
- Automatic compression triggers

**Compression Strategy:**
- Triggered every K messages
- Uses cheaper model (e.g., GPT-3.5) for summarization
- Stores summaries with source message references
- Maintains high-confidence facts separately

**Context Rendering Strategy:**
- Allocates 20% of total token budget
- Shows recent summaries
- Includes high-confidence facts (>0.8)
- Prioritizes relevant information

**Usage Example:**
```typescript
const memory = new Memory({
  compressionInterval: 20,
  embeddingEnabled: true
})

// Add fact manually
memory.addFact({
  content: 'User prefers TypeScript',
  confidence: 0.9,
  source: 'conversation',
  category: 'preference'
})

// Retrieval happens automatically during context rendering
```

**Implementation:** `src/components/memory.ts`

### 3. Todo

Task planning and tracking with dependency management.

**Configuration Options:**
- `maxTasks`: Maximum tasks to track (default: 100)
- `maxDepth`: Maximum subtask depth (default: 3)
- `autoDecompose`: Auto-decompose complex tasks (default: true)
- `priorityAlgorithm`: Task selection algorithm (default: 'dependency')

**Key Features:**
- Task creation and status tracking
- Dependency resolution (tasks can depend on other tasks)
- Priority-based scheduling
- Auto-decomposition of complex tasks
- Subtask support

**Task States:**
- `pending`: Not started
- `in_progress`: Currently being worked on
- `completed`: Successfully finished
- `failed`: Failed to complete
- `blocked`: Waiting on dependencies

**Context Rendering Strategy:**
- Allocates 20% of total token budget
- Shows current task with full details
- Lists pending high-priority tasks
- Displays dependency information
- Visualizes task relationships

**Usage Example:**
```typescript
const todo = new Todo({
  autoDecompose: true,
  priorityAlgorithm: 'dependency'
})

// Add task
const taskId = await todo.addTask({
  title: 'Implement authentication',
  description: 'Add JWT-based auth',
  priority: 8,
  status: 'pending',
  dependencies: [],
  subtasks: [],
  parentTask: null,
  estimatedTokens: 1000,
  actualTokens: 0,
  metadata: {}
})

// Update status
await todo.updateTaskStatus(taskId, 'in_progress')

// Get next executable task (no unmet dependencies)
const next = todo.getNextTask()

// Complete task
await todo.updateTaskStatus(taskId, 'completed')
```

**Implementation:** `src/components/todo.ts`

### 4. SubAgent

Delegates subtasks to independent child agents.

**Configuration Options:**
- `maxConcurrent`: Maximum concurrent subagents (default: 3)
- `timeout`: Execution timeout in ms (default: 300000 = 5 min)
- `shareTools`: Share parent's tools (default: true)

**Design Decision:**
SubAgents are independent Agent instances that:
- Share infrastructure (model router, tools) with parent
- Maintain isolated state (own component instances)
- Return results via completion events
- Fail independently without affecting parent

**Key Features:**
- Concurrent execution with configurable limit
- Timeout protection
- Result aggregation
- Failure isolation
- Parallel task execution

**Context Rendering Strategy:**
- Allocates minimal token budget
- Shows active subagent status
- Lists recently completed subagents
- Includes execution metrics (duration, tokens, cost)

**Usage Example:**
```typescript
const subAgent = new SubAgent({
  maxConcurrent: 5,
  shareTools: true
})

// Execute single subtask
const id = await subAgent.createSubAgent('Analyze code quality')
const result = await subAgent.executeSubAgent(id, 'Analyze code quality')

// Execute parallel subtasks
const results = await subAgent.executeParallel([
  'Generate unit tests',
  'Write documentation',
  'Optimize performance'
])

console.log(`Completed ${results.length} subtasks`)
```

**Implementation:** `src/components/sub-agent.ts`

## Creating Custom Components

### Basic Template

```typescript
import { BaseComponent } from '../core/component'
import type { AgentEvent, ContextFragment, TokenBudget } from '../types'

export class CustomComponent extends BaseComponent {
  name = 'custom-component'
  version = '1.0.0'
  dependencies: string[] = [] // e.g., ['working-history']
  
  constructor(config: CustomConfig = {}) {
    super()
    // Initialize your state
    this.state = {
      // your state here
    }
  }
  
  async onEvent(event: AgentEvent): Promise<void> {
    // Handle relevant events
    if (event.type === 'llm:call_completed') {
      // Do something
    }
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    // Build your context contribution
    const content = '## Custom Component\n\n...'
    const tokens = this.estimateTokens(content)
    
    return {
      content,
      tokens,
      priority: 5 // 1-10, higher = more important
    }
  }
}
```

### Component Best Practices

1. **Keep state minimal**: Only store what's necessary
2. **Use events for communication**: Don't directly call other components
3. **Respect token budget**: Don't exceed allocated budget
4. **Handle errors gracefully**: Don't crash the agent
5. **Persist important state**: Use storage for durability
6. **Document dependencies**: Clearly specify component dependencies
7. **Version your component**: Use semantic versioning
8. **Test in isolation**: Unit test components independently
9. **Optimize context rendering**: Cache expensive computations
10. **Emit events**: Let others observe your component's behavior

### Component Lifecycle

1. **Registration**: Component registered with agent
2. **Dependency Resolution**: Dependencies resolved in topological order
3. **Initialization**: `init()` called with context
4. **Event Handling**: `onEvent()` called for relevant events
5. **Context Rendering**: `renderContext()` called before LLM calls
6. **State Persistence**: State automatically saved to SQLite
7. **Destruction**: `destroy()` called on agent shutdown

### Accessing Agent Context

Components receive context during initialization:

```typescript
async init(context: ComponentContext): Promise<void> {
  this.context = context
  
  // Access agent
  const agent = context.agent
  
  // Subscribe to events
  context.eventBus.on('some:event', this.handleEvent.bind(this))
  
  // Access storage
  const saved = await context.storage.get(this.name)
  
  // Access logger
  context.logger.info('Component initialized')
}
```

### Emitting Events

Components can emit events to notify others:

```typescript
this.emit({
  type: 'component:state_updated',
  component: this.name,
  state: this.state
})
```

### Token Budget Management

Components receive a token budget and must stay within it:

```typescript
async renderContext(budget: TokenBudget): Promise<ContextFragment> {
  const allocated = budget.allocated || budget.history // fallback
  let content = ''
  let tokens = 0
  
  // Add content until budget exhausted
  for (const item of this.items) {
    const itemTokens = this.estimateTokens(item)
    if (tokens + itemTokens > allocated) break
    
    content += item + '\n'
    tokens += itemTokens
  }
  
  return { content, tokens, priority: 7 }
}
```

## Component Examples

### Analytics Component

Tracks agent performance metrics:

```typescript
export class Analytics extends BaseComponent {
  name = 'analytics'
  version = '1.0.0'
  
  async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'llm:call_completed') {
      // Track metrics
      this.state.totalCalls++
      this.state.totalCost += event.cost
      this.state.totalTokens += event.tokens.total
    }
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    return {
      content: `## Performance\nCalls: ${this.state.totalCalls}, Cost: $${this.state.totalCost}`,
      tokens: 50,
      priority: 3
    }
  }
}
```

### Context Component

Maintains domain-specific context:

```typescript
export class DomainContext extends BaseComponent {
  name = 'domain-context'
  version = '1.0.0'
  
  setContext(key: string, value: any): void {
    this.state[key] = value
    this.emit({
      type: 'component:state_updated',
      component: this.name,
      state: this.state
    })
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    const content = Object.entries(this.state)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    
    return {
      content: `## Domain Context\n${content}`,
      tokens: this.estimateTokens(content),
      priority: 6
    }
  }
}
```

## Testing Components

### Unit Testing

```typescript
import { describe, test, expect } from 'bun:test'
import { WorkingHistory } from './working-history'

describe('WorkingHistory', () => {
  test('adds messages', () => {
    const history = new WorkingHistory()
    
    history.addMessage({
      role: 'user',
      content: 'Hello',
      important: false
    })
    
    expect(history.getMessages()).toHaveLength(1)
  })
  
  test('compresses when threshold reached', () => {
    const history = new WorkingHistory({
      compressionThreshold: 5
    })
    
    // Add 10 messages
    for (let i = 0; i < 10; i++) {
      history.addMessage({
        role: 'user',
        content: `Message ${i}`,
        important: false
      })
    }
    
    // Should have compressed
    expect(history.getState().compressionCount).toBeGreaterThan(0)
  })
})
```

## Component Registry

The agent maintains a registry of all components:
- Components are initialized in dependency order
- Circular dependencies are detected and rejected
- Components can query other components via the agent

This enables powerful composition patterns while maintaining loose coupling.
