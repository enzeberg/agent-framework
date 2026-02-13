# Getting Started

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-framework

# Install dependencies
bun install
```

## Quick Start

### 1. Basic Agent

```typescript
import { Agent, WorkingHistory, ModelRouter } from './src'

const modelRouter = new ModelRouter({
  defaultModel: 'gpt-3.5-turbo',
  fallbackModel: 'claude-3-haiku',
  strategy: 'balanced',
  maxCostPerRequest: 0.10,
  providers: [
    { name: 'openai', models: ['gpt-3.5-turbo'], enabled: true }
  ]
})

const agent = new Agent({
  name: 'MyAgent',
  components: [new WorkingHistory()],
  modelRouter
})

await agent.init()
const result = await agent.execute('Hello, world!')
console.log(result)
```

### 2. Task Planning Agent

```typescript
import { Agent, WorkingHistory, Memory, Todo, ModelRouter } from './src'

const agent = new Agent({
  name: 'TaskPlanner',
  components: [
    new WorkingHistory({ maxMessages: 50 }),
    new Memory({ compressionInterval: 20 }),
    new Todo({ autoDecompose: true })
  ],
  modelRouter,
  systemPrompt: 'You are a task planning assistant.'
})

await agent.init()
await agent.execute('Plan a project to build a web app')
```

### 3. Code Generation Agent

```typescript
import { Agent, WorkingHistory, Memory, SubAgent, ModelRouter } from './src'

const agent = new Agent({
  name: 'CodeGenerator',
  components: [
    new WorkingHistory(),
    new Memory(),
    new SubAgent({ maxConcurrent: 3 })
  ],
  modelRouter,
  systemPrompt: 'You are a code generation assistant.'
})

await agent.init()
await agent.execute('Generate a REST API with authentication')
```

## Running Examples

```bash
# Task planner example
bun examples/task-planner.ts

# Code generator example
bun examples/code-generator.ts
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/agent.test.ts

# Run with coverage
bun test --coverage
```

## Project Structure

```
agent-framework/
├── src/
│   ├── core/              # Core framework
│   │   ├── agent.ts       # Main agent class
│   │   ├── component.ts   # Component base class
│   │   ├── event-bus.ts   # Event system
│   │   ├── storage.ts     # SQLite storage
│   │   ├── context-builder.ts  # Context building
│   │   └── model-router.ts     # Model selection
│   ├── components/        # Built-in components
│   │   ├── working-history.ts
│   │   ├── memory.ts
│   │   ├── todo.ts
│   │   └── sub-agent.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   └── index.ts          # Main exports
├── examples/             # Example agents
│   ├── task-planner.ts
│   └── code-generator.ts
├── tests/                # Test files
│   └── agent.test.ts
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md
│   ├── COMPONENTS.md
│   ├── MODEL_ROUTER.md
│   ├── DATA_FLOW.md
│   └── GETTING_STARTED.md
├── package.json
├── tsconfig.json
└── README.md
```

## Key Concepts

### Agent Lifecycle

```
idle → running → completed
  ↓       ↓         ↓
  └───────┴─────────┘ (resumable via pause/resume)
```

### Components

Components are modular pieces that:
- Maintain their own state
- Respond to events
- Contribute to LLM context
- Can depend on other components

### Events

All state changes emit events:
- `lifecycle:state_changed` - Agent state transitions
- `component:state_updated` - Component state changes
- `llm:call_started` / `llm:call_completed` - LLM calls
- `tool:executed` - Tool executions
- `error:occurred` - Errors

### Token Budget

Context is built with a token budget:
- System: 10%
- Memory: 20%
- History: 40%
- Todo: 20%
- Current: 10%

Components must stay within their allocated budget.

### Model Router

Automatically selects models based on:
- Task complexity
- Quality requirements
- Cost constraints
- Latency requirements

## Monitoring

### Listen to Events

```typescript
agent.on('llm:call_completed', (event) => {
  if (event.type === 'llm:call_completed') {
    console.log(`Cost: $${event.cost}`)
    console.log(`Tokens: ${event.tokens.total}`)
  }
})

agent.on('error:occurred', (event) => {
  if (event.type === 'error:occurred') {
    console.error('Error:', event.error)
  }
})
```

### Track Metrics

```typescript
// Get token usage
const usage = agent.getTokenUsage()
console.log(`Total tokens: ${usage.total}`)

// Get cost
const cost = agent.getCost()
console.log(`Total cost: $${cost}`)

// Get state
const state = agent.getState()
console.log(`Agent state: ${state}`)
```

### State Snapshots

```typescript
// Take snapshot
const snapshot = await agent.takeSnapshot()
console.log('Snapshot:', snapshot)

// Restore snapshot
await agent.restoreSnapshot(snapshot)
```

## Creating Custom Components

```typescript
import { BaseComponent } from './src/core/component'
import type { AgentEvent, ContextFragment, TokenBudget } from './src/types'

export class MyComponent extends BaseComponent {
  name = 'my-component'
  version = '1.0.0'
  
  async onEvent(event: AgentEvent): Promise<void> {
    // Handle events
  }
  
  async renderContext(budget: TokenBudget): Promise<ContextFragment> {
    return {
      content: '## My Component\n\nSome context...',
      tokens: 50,
      priority: 5
    }
  }
}

// Use it
const agent = new Agent({
  name: 'MyAgent',
  components: [new MyComponent()],
  modelRouter
})
```

## Best Practices

1. **Start Simple**: Begin with basic components, add more as needed
2. **Monitor Costs**: Always track token usage and costs
3. **Use Events**: Listen to events for observability
4. **Test Components**: Unit test components in isolation
5. **Respect Budgets**: Stay within token budgets
6. **Handle Errors**: Gracefully handle LLM and tool errors
7. **Persist State**: Use snapshots for important states
8. **Optimize Context**: Keep context concise and relevant
9. **Choose Models Wisely**: Use appropriate models for tasks
10. **Document Components**: Document custom components well

## Troubleshooting

### Agent not initializing

Make sure to call `await agent.init()` before executing tasks.

### High costs

- Check token usage with `agent.getTokenUsage()`
- Reduce `maxTokens` in agent config
- Use cheaper models for simple tasks
- Enable caching in model router

### Slow performance

- Use faster models (Tier 3) for simple tasks
- Reduce context size
- Optimize component context rendering
- Enable caching

### Database errors

- Check database path is writable
- Use `:memory:` for testing
- Close agent properly with `await agent.stop()`

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for design details
- Read [COMPONENTS.md](./COMPONENTS.md) for component guide
- Read [MODEL_ROUTER.md](./MODEL_ROUTER.md) for routing details
- Read [DATA_FLOW.md](./DATA_FLOW.md) for execution flow
- Check examples in `examples/` directory
- Write your own custom components
- Build your own agents!

## Support

For issues and questions:
- Check documentation in `docs/`
- Review examples in `examples/`
- Run tests to verify setup: `bun test`
