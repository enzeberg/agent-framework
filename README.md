# Agent Framework

A local-first, extensible AI Agent framework inspired by Claude Code, designed for building intelligent agents with state management, component composition, and economic LLM usage.

## Features

- **Component-based Architecture**: Modular design with pluggable components (Memory, WorkingHistory, Todo, SubAgent)
- **Multi-Model Support**: Smart model routing across multiple LLM providers (OpenAI, Anthropic, local models)
- **Economic Token Management**: Intelligent context compression, truncation, and model selection
- **State Persistence**: SQLite-based state management with export/import capabilities
- **MCP Tool Integration**: Built-in support for Model Context Protocol tools
- **Observable & Debuggable**: Event system, state snapshots, and time-travel debugging
- **Plugin System**: Easy extension with third-party components

## Quick Start

```bash
# Install dependencies
bun install

# Run simple demo
bun demo

# Run examples
bun example:planner    # Task planning assistant
bun example:coder      # Code generation assistant

# Run tests
bun test
```

## Basic Usage

```typescript
import { Agent, WorkingHistory, Memory, Todo, ModelRouter } from './src'

// Create model router
const modelRouter = new ModelRouter({
  defaultModel: 'gpt-3.5-turbo',
  fallbackModel: 'claude-3-haiku',
  strategy: 'balanced',
  maxCostPerRequest: 0.10,
  providers: [
    { name: 'openai', models: ['gpt-4', 'gpt-3.5-turbo'], enabled: true }
  ]
})

// Create agent with components
const agent = new Agent({
  name: 'MyAgent',
  components: [
    new WorkingHistory({ maxMessages: 50 }),
    new Memory({ compressionInterval: 20 }),
    new Todo({ autoDecompose: true })
  ],
  modelRouter,
  systemPrompt: 'You are a helpful AI assistant.',
  maxTokens: 8000
})

// Initialize and execute
await agent.init()
const result = await agent.execute('Your task here')
console.log(result)

// Get metrics
console.log('Cost:', agent.getCost())
console.log('Tokens:', agent.getTokenUsage())
```

## Architecture

The framework consists of several key layers:

1. **Core Layer**: Agent lifecycle, component system, event bus
2. **Component Layer**: Reusable components (Memory, History, Todo, SubAgent)
3. **Strategy Layer**: Model routing, context compression, token budgeting
4. **Integration Layer**: LLM providers, MCP tools, storage
5. **Plugin Layer**: Third-party extensions

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design.

## Project Structure

```
agent-framework/
├── src/
│   ├── core/              # Core framework
│   ├── components/        # Built-in components
│   ├── strategies/        # Economic strategies
│   ├── integrations/      # LLM & tool integrations
│   ├── plugins/           # Plugin system
│   └── examples/          # Example agents
├── docs/                  # Documentation
├── tests/                 # Test suites
└── package.json
```

## Requirements

- **Runtime**: Bun >= 1.0
- **Language**: TypeScript
- **Database**: SQLite (Bun built-in)

## Installation

```bash
# Install dependencies
bun install

# Run simple demo
bun demo

# Run examples
bun example:planner    # Task planning assistant
bun example:coder      # Code generation assistant

# Run tests
bun test
```

## Documentation

- [Architecture Design](./ARCHITECTURE.md) - System architecture and design decisions
- [Component Guide](./docs/COMPONENTS.md) - How to use and create components
- [Model Router](./docs/MODEL_ROUTER.md) - Model selection and routing
- [Data Flow](./docs/DATA_FLOW.md) - Complete execution flow
- [Getting Started](./docs/GETTING_STARTED.md) - Quick start guide
- [Implementation Notes](./IMPLEMENTATION_NOTES.md) - Implementation details
- [Project Summary](./PROJECT_SUMMARY.md) - Project overview

## Project Status

✅ **Core Framework**: Complete and functional
✅ **Components**: 4 built-in components implemented
✅ **Model Router**: Intelligent model selection
✅ **State Management**: SQLite persistence with snapshots
✅ **Observability**: Complete event system
✅ **Documentation**: Comprehensive docs and examples
✅ **Tests**: Unit tests for core functionality

🔄 **LLM Integration**: Mock implementation (ready for real API)
🔄 **MCP Tools**: Interface defined (ready for implementation)

See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for details.

## Development

```bash
# Run examples
bun examples/task-planner.ts
bun examples/code-generator.ts

# Run tests
bun test

# Build
bun build
```

## Key Concepts

### Agent Lifecycle

```
idle → running → paused/completed/failed
  ↓       ↓         ↓
  └───────┴─────────┘ (resumable)
```

### Component System

Components are self-contained modules that:
- Maintain their own state
- Respond to events
- Contribute to LLM context
- Can depend on other components

### Model Router

Intelligently selects models based on:
- Task complexity
- Token budget
- Cost constraints
- Provider availability

### Context Building

Hierarchical context construction:
```
System Prompt (10%)
  ↓
Memory Context (20%)
  ↓
Working History (40%)
  ↓
Todo Context (20%)
  ↓
Current Task (10%)
```

## Examples

### Task Planning Assistant

```typescript
const planner = new Agent({
  name: 'TaskPlanner',
  components: [
    new WorkingHistory({ maxMessages: 50 }),
    new Memory({ compressionInterval: 20 }),
    new Todo({ autoDecompose: true })
  ],
  modelRouter,
  systemPrompt: 'You are a task planning assistant.'
})

await planner.init()
await planner.execute('Create a project plan for building a REST API')
```

### Code Generation Assistant

```typescript
const coder = new Agent({
  name: 'CodeGenerator',
  components: [
    new WorkingHistory(),
    new Memory(),
    new SubAgent({ maxConcurrent: 3 })
  ],
  modelRouter,
  systemPrompt: 'You are a code generation assistant.'
})

await coder.init()
await coder.execute('Generate a TypeScript REST API with authentication')
```

See `examples/` directory for complete working examples.

## Documentation

- [Architecture Design](./ARCHITECTURE.md)
- [Component Guide](./docs/COMPONENTS.md)
- [Model Router](./docs/MODEL_ROUTER.md)
- [Plugin Development](./docs/PLUGINS.md)
- [API Reference](./docs/API.md)

## License

MIT
