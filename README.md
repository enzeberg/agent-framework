# Agent Framework

A local-first, extensible AI Agent framework inspired by Claude Code, designed for building intelligent agents with state management, component composition, and economic LLM usage.

## Features

- **Multi-Provider LLM Integration**: Supports OpenAI, Anthropic (Claude), and Google Gemini out of the box
- **Automatic Provider Detection**: Set API keys in `.env`, ModelRouter auto-detects and routes to available providers
- **Tool-Calling Loop**: Automatic multi-round tool execution (LLM → tool_calls → execute → LLM → ...)
- **Component-based Architecture**: Modular design with pluggable components (Memory, WorkingHistory, Todo, SubAgent)
- **Smart Model Routing**: Selects from available models based on task complexity, cost, and quality requirements
- **Economic Token Management**: Intelligent context compression, truncation, and model selection
- **State Persistence**: SQLite-based state management with export/import capabilities
- **Observable & Debuggable**: Event system, state snapshots, and time-travel debugging

## Quick Start

```bash
# Install dependencies
bun install

# Configure API key (set at least one)
cp .env.example .env
# Edit .env: set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY

# Run mock demo (no model provider API key needed)
bun demo

# Run demo with real LLM + tool calling
bun demo:llm

# Run tests
bun test
```

## Basic Usage

### With Real LLM + Tools

```typescript
import { Agent, WorkingHistory, Memory, Todo, ModelRouter, type Tool } from './src'

// ModelRouter auto-detects providers from .env
const modelRouter = new ModelRouter({
  strategy: 'balanced',
  maxCostPerRequest: 0.10,
})

// Define tools
const myTool: Tool = {
  name: 'get_weather',
  description: 'Get weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city']
  },
  async execute(input) {
    return { city: input.city, temp: '22°C', condition: 'Sunny' }
  }
}

// Create agent — no need to specify a provider manually
const agent = new Agent({
  name: 'MyAgent',
  components: [
    new WorkingHistory({ maxMessages: 50 }),
    new Memory({ compressionInterval: 20 }),
    new Todo({ autoDecompose: true })
  ],
  modelRouter,
  tools: [myTool],
  systemPrompt: 'You are a helpful assistant. Use tools when needed.',
  maxTokens: 4000
})

await agent.init()
const result = await agent.execute('What is the weather in Tokyo?')
console.log(result)
// ModelRouter selects the best available model, calls the LLM,
// executes get_weather tool, and returns the final answer.
```

### Mock Mode (No API Key)

```typescript
// When no API key is set in .env, Agent falls back to mock mode automatically
const agent = new Agent({
  name: 'MockAgent',
  components: [ new WorkingHistory() ],
  modelRouter: new ModelRouter({ strategy: 'balanced', maxCostPerRequest: 0.10 }),
  systemPrompt: 'You are a helpful AI assistant.'
})

await agent.init()
const result = await agent.execute('Hello')
// Returns: "[Mock] Response for: Hello"
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
│   ├── core/              # Core framework (Agent, EventBus, Storage, ModelRouter, LLM Providers)
│   ├── components/        # Built-in components (WorkingHistory, Memory, Todo, SubAgent)
│   ├── types/             # TypeScript types
│   └── index.ts           # Main exports
├── examples/              # Example agents (simple-demo, llm-demo, task-planner, code-generator)
├── docs/                  # Documentation
├── tests/                 # Test suites
├── .env.example           # Environment variable template
└── package.json
```

## Requirements

- **Runtime**: Bun >= 1.0
- **Language**: TypeScript
- **Database**: SQLite (Bun built-in)

## Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Set at least one provider API key:

| Provider | Environment Variable | Models |
|----------|---------------------|--------|
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-4, gpt-3.5-turbo |
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet-4, claude-3.5-sonnet, claude-3.5-haiku |
| **Google Gemini** | `GEMINI_API_KEY` | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |

ModelRouter automatically detects which keys are set and only offers models from available providers.

## Project Status

✅ **Core Framework**: Complete and functional
✅ **LLM Integration**: OpenAI, Anthropic, Gemini providers
✅ **Tool-Calling Loop**: Multi-round LLM → tools → LLM execution
✅ **Auto Provider Detection**: ModelRouter reads .env and creates providers
✅ **Components**: 4 built-in components implemented
✅ **Model Router**: Smart model selection from available providers
✅ **State Management**: SQLite persistence with snapshots
✅ **Observability**: Complete event system
✅ **Tests**: Unit tests for core functionality

🔄 **MCP Tools**: Interface defined (ready for implementation)

## Development

```bash
# Run LLM demo with tools (requires .env)
bun demo:llm

# Run mock demo (no API key needed)
bun demo

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

### Model Router

ModelRouter is the central orchestrator for LLM calls:
- Auto-detects available providers from .env API keys
- Maintains a registry of models with tier, cost, and context window info
- `selectModel()` picks the best model from available ones based on criteria
- `call()` routes to the correct provider and returns a unified response

### Tool-Calling Loop

When tools are provided, the agent automatically runs a multi-round loop:

```
1. Build messages from system prompt + component context + user task
2. ModelRouter selects model and calls the right provider
3. If LLM returns tool_calls:
   a. Execute each tool
   b. Append tool results as messages
   c. Go to step 2
4. If LLM returns final text → done
```

Maximum rounds are configurable via `maxToolRounds` (default: 10).

### Context Building

Hierarchical context construction with token budgets:
```
System Prompt (10%)  →  Memory Context (20%)  →  Working History (40%)  →  Todo Context (20%)  →  Current Task (10%)
```

## Examples

### LLM + Tool Calling (Real API)

```bash
bun demo:llm    # Requires .env with at least one API key
```

See `examples/llm-demo.ts` for a complete example with 3 tools (time, calculator, knowledge search).

### Mock Mode

```bash
bun demo        # No API key needed
```

See `examples/` directory for all examples.

## License

MIT
