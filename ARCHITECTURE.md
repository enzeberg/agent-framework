# Architecture Design

## Overview

This Agent framework is designed as a local-first, component-based system that balances effectiveness with economic LLM usage.

**Core Principles:**
- **Modularity**: Components are independent and composable
- **Observability**: All state changes emit events
- **Economy**: Smart token management and model selection
- **Extensibility**: Plugin system for third-party components
- **Persistence**: SQLite-based state with export/import

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              State Manager                             │  │
│  │  (lifecycle, snapshots, persistence)                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Event Bus                                 │  │
│  │  (pub/sub, event replay, debugging)                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────┬──────────────┬──────────────┬─────────┐  │
│  │ WorkingHistory│   Memory    │     Todo     │SubAgent │  │
│  │  Component   │  Component   │  Component   │Component│  │
│  └──────────────┴──────────────┴──────────────┴─────────┘  │
│                           ↕                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Context Builder                              │  │
│  │  (token budget, compression, prioritization)           │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Model Router                                 │  │
│  │  (provider selection, model selection, fallback)       │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────┬──────────────┬──────────────┬─────────┐  │
│  │   OpenAI     │  Anthropic   │   Ollama     │  Custom │  │
│  │   Provider   │   Provider   │   Provider   │Provider │  │
│  └──────────────┴──────────────┴──────────────┴─────────┘  │
│                           ↕                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Tool Registry (MCP)                          │  │
│  │  (file system, code analysis, web search, etc.)        │  │
│  └───────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Storage Layer (SQLite)                       │  │
│  │  (state, history, memory, snapshots)                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent

The main orchestrator managing the entire lifecycle.

**Responsibilities:**
- Initialize and coordinate components
- Execute tasks through LLM calls
- Manage state transitions
- Handle pause/resume/stop operations
- Emit lifecycle events

**State Machine:**
```
┌──────┐  start()   ┌─────────┐  pause()   ┌────────┐
│ idle │ ────────→  │ running │ ────────→  │ paused │
└──────┘            └─────────┘            └────────┘
   ↑                    │  │                    │
   │                    │  │ complete()         │ resume()
   │                    │  ↓                    │
   │                    │ ┌───────────┐         │
   │                    │ │ completed │         │
   │                    │ └───────────┘         │
   │                    │                       │
   │                    │ error()               │
   │                    ↓                       │
   │                 ┌────────┐                 │
   └─────────────────│ failed │←────────────────┘
                     └────────┘
```

**Implementation:** `src/core/agent.ts`

### 2. Component System

Components are self-contained modules with standardized interfaces.

**Component Lifecycle:**
1. Registration: Components register with the agent
2. Dependency Resolution: Topological sort based on dependencies
3. Initialization: Components initialize in dependency order
4. Event Handling: Components respond to events
5. Context Rendering: Components contribute to LLM context
6. Destruction: Clean up resources

**Key Interface Methods:**
- `init()`: Initialize component with context
- `onEvent()`: Handle agent events
- `renderContext()`: Contribute to LLM prompt
- `getState()` / `setState()`: State management
- `destroy()`: Cleanup

**Implementation:** `src/core/component.ts`

### 3. Event Bus

Centralized event system for component communication and observability.

**Event Categories:**
- Lifecycle events (state changes)
- Component events (state updates)
- LLM events (calls, completions)
- Tool events (executions)
- Error events

**Features:**
- Event replay for debugging
- Event filtering and subscription
- Event persistence for time-travel debugging
- Async event handling

**Implementation:** `src/core/event-bus.ts`

### 4. State Manager (Storage)

Manages agent and component state with SQLite persistence.

**Features:**
- State snapshots (JSON serialization)
- State export/import
- Event persistence
- State versioning
- Query support

**Database Schema:**
- `agent_states`: Agent lifecycle states
- `component_states`: Component states
- `events`: Event history

**Implementation:** `src/core/storage.ts`

## Built-in Components

### 1. WorkingHistory

Manages conversation and operation history with intelligent compression.

**Key Features:**
- Tracks all messages and operations
- Marks important messages for retention
- Automatic compression when threshold reached
- Sliding window for recent messages

**Context Strategy:**
- Keep recent N messages
- Always keep important messages
- Compress older messages via summarization
- Token budget: 40% of total

**Implementation:** `src/components/working-history.ts`

### 2. Memory

Long-term memory with summarization and fact extraction.

**Key Features:**
- Periodic summarization of conversations
- Fact extraction with confidence scores
- Optional semantic search via embeddings
- Automatic compression triggers

**Compression Strategy:**
- Trigger every K messages
- Use cheaper model for summarization
- Store summaries with source references
- Token budget: 20% of total

**Implementation:** `src/components/memory.ts`

### 3. Todo

Task planning and tracking with dependency management.

**Key Features:**
- Task creation and status tracking
- Dependency resolution
- Priority-based scheduling
- Auto-decomposition of complex tasks

**Context Strategy:**
- Show current task with full details
- Display pending high-priority tasks
- Visualize task dependency graph
- Token budget: 20% of total

**Implementation:** `src/components/todo.ts`

### 4. SubAgent

Delegates subtasks to independent child agents.

**Design Decision:** SubAgents are independent Agent instances that share infrastructure (model router, tools) but maintain isolated state.

**Key Features:**
- Concurrent execution (configurable limit)
- Timeout protection
- Result aggregation
- Failure isolation

**Implementation:** `src/components/sub-agent.ts`

## Economic Strategies

### 1. Model Router

Intelligently selects models based on multiple factors.

**Model Tiers:**
- **Tier 1 (Strong)**: GPT-4, Claude Sonnet - for complex reasoning
- **Tier 2 (Balanced)**: GPT-3.5, Claude Haiku - for general tasks
- **Tier 3 (Fast)**: Local models - for simple tasks

**Selection Criteria:**
- Task complexity
- Quality requirements
- Cost constraints
- Latency requirements

**Routing Logic:**
```
Complex task OR High quality → Tier 1
Low cost OR Low latency → Tier 3
Default → Tier 2
```

**Features:**
- Automatic fallback on failure
- Health monitoring
- Rate limiting
- Cost tracking

**Implementation:** `src/core/model-router.ts`

### 2. Context Compression

**Token Budget Allocation:**
- System: 10%
- Memory: 20%
- History: 40%
- Todo: 20%
- Current: 10%

**Compression Strategies:**
1. Sliding Window: Keep recent N messages
2. Summarization: Periodically summarize old messages
3. Importance Sampling: Keep important messages
4. Semantic Deduplication: Remove redundant information

**Truncation Strategy:**
When over budget, compress in priority order:
1. Compress old history messages
2. Compress memory summaries
3. Reduce todo task details
4. Truncate current task context (last resort)

**Implementation:** `src/core/context-builder.ts`

### 3. Cost Tracking

Track and optimize LLM costs across models and components.

**Metrics:**
- Total cost
- Cost by model
- Cost by component
- Token usage (input/output/total)

## Tool Integration (MCP)

### Tool Registry

Manages MCP-compatible tools with standardized interface.

**Built-in Tools:**
1. FileSystemTool: Read/write files, list directories
2. CodeAnalysisTool: Parse and analyze code
3. WebSearchTool: Search the web
4. ShellTool: Execute shell commands

**Tool Execution Flow:**
1. LLM requests tool execution
2. Validate tool input against schema
3. Execute tool with timeout
4. Capture output and errors
5. Emit tool:executed event
6. Return result to LLM

## Observability

### Event System

All state changes emit events for external monitoring.

**Event Types:**
- `lifecycle:state_changed`
- `component:initialized`
- `component:state_updated`
- `llm:call_started`
- `llm:call_completed`
- `tool:executed`
- `context:built`
- `error:occurred`

### Debugging Support

1. **State Snapshots**: Capture full agent state at any point
2. **Event Replay**: Replay events to reproduce issues
3. **Step Mode**: Execute one step at a time
4. **Breakpoints**: Pause execution at specific events

### Metrics

Track key performance indicators:
- Total executions
- Success rate
- Average latency
- Total cost
- Token usage
- Model usage distribution
- Tool usage distribution

## Plugin System

### Plugin Interface

Plugins can extend the framework with:
1. **Component Plugins**: Add new components
2. **Tool Plugins**: Add new tools
3. **Provider Plugins**: Add new LLM providers
4. **Strategy Plugins**: Add new compression/routing strategies

### Plugin Lifecycle

1. Install: Register with agent
2. Initialize: Setup resources
3. Execute: Provide functionality
4. Uninstall: Cleanup resources

## Design Decisions

### Why Component-Based Architecture?

- **Modularity**: Easy to add/remove functionality
- **Testability**: Components can be tested in isolation
- **Reusability**: Components can be shared across agents
- **Maintainability**: Clear separation of concerns

### Why Event-Driven Communication?

- **Decoupling**: Components don't need direct references
- **Observability**: External systems can monitor all changes
- **Debugging**: Event replay enables time-travel debugging
- **Extensibility**: New listeners can be added without modifying components

### Why SQLite for Persistence?

- **Local-first**: No external dependencies
- **Performance**: Fast for local operations
- **Reliability**: ACID transactions
- **Portability**: Single file database
- **Queryable**: SQL for complex queries

### Why Hierarchical Context Building?

- **Predictability**: Clear token budget allocation
- **Control**: Fine-grained control over context composition
- **Optimization**: Easy to identify and compress expensive components
- **Flexibility**: Components can adjust based on available budget

### SubAgent Design: Independent vs Shared

**Decision: Independent Agent instances with shared infrastructure**

**Rationale:**
- **Isolation**: SubAgent failures don't affect parent
- **Simplicity**: Same Agent interface for parent and children
- **Resource Sharing**: Share expensive resources (model router, tools)
- **State Independence**: Each agent maintains its own state

**Trade-offs:**
- More memory usage (separate component instances)
- More complex result aggregation
- But: Better fault isolation and simpler mental model

## Performance Considerations

### Token Budget Optimization

- Pre-calculate token counts for static content
- Cache tokenization results
- Use approximate token counting for speed

### Database Optimization

- Index frequently queried columns
- Batch inserts for events
- Periodic cleanup of old data
- Use WAL mode for better concurrency

### Memory Management

- Limit in-memory message history
- Stream large responses
- Lazy load component state
- Implement LRU cache for embeddings

## Security Considerations

- Validate all tool inputs
- Sandbox tool execution
- Rate limiting for LLM calls
- Sanitize user inputs
- Encrypt sensitive data in SQLite
- Audit log for all operations
