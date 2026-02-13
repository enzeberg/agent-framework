# Data Flow Diagram

## Complete Agent Execution Flow

This document illustrates the complete data flow for a single agent execution cycle.

## High-Level Flow

```
User Request
    ↓
Agent.execute()
    ↓
State: idle → running
    ↓
Event: lifecycle:state_changed
    ↓
Components receive event
    ↓
Context Builder collects fragments
    ↓
Token budget allocation
    ↓
Context compression (if needed)
    ↓
Model Router selects model
    ↓
LLM API call
    ↓
Response processing
    ↓
Tool execution (if requested)
    ↓
Components update state
    ↓
State persistence
    ↓
State: running → completed
    ↓
Return result to user
```

## Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER REQUEST                                                  │
│    agent.execute("Create a REST API with authentication")       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. AGENT LIFECYCLE TRANSITION                                    │
│    State: idle → running                                         │
│    Timestamp: 1234567890                                         │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. EVENT EMISSION                                                │
│    EventBus.emit({                                               │
│      type: 'lifecycle:state_changed',                            │
│      from: 'idle',                                               │
│      to: 'running',                                              │
│      timestamp: 1234567890                                       │
│    })                                                            │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. COMPONENT EVENT HANDLING (Parallel)                           │
│                                                                  │
│    ┌──────────────┐  ┌──────────┐  ┌──────┐  ┌──────────┐     │
│    │WorkingHistory│  │  Memory  │  │ Todo │  │ SubAgent │     │
│    └──────┬───────┘  └────┬─────┘  └───┬──┘  └────┬─────┘     │
│           │               │             │          │            │
│           ↓               ↓             ↓          ↓            │
│    onEvent()       onEvent()     onEvent()   onEvent()         │
│    Update state    Check if      Get next    Check active      │
│                    compression   task        subagents         │
│                    needed                                       │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. CONTEXT BUILDING                                              │
│                                                                  │
│    ContextBuilder.build()                                        │
│    ├─ Calculate token budget (e.g., 8000 tokens)                │
│    ├─ Allocate budget to components:                            │
│    │  ├─ System: 800 (10%)                                      │
│    │  ├─ Memory: 1600 (20%)                                     │
│    │  ├─ History: 3200 (40%)                                    │
│    │  ├─ Todo: 1600 (20%)                                       │
│    │  └─ Current: 800 (10%)                                     │
│    │                                                             │
│    └─ Request context from each component:                      │
│       ├─ WorkingHistory.renderContext(3200)                     │
│       │  → Returns recent 15 messages (2800 tokens)             │
│       ├─ Memory.renderContext(1600)                             │
│       │  → Returns 3 summaries + 5 facts (1400 tokens)          │
│       ├─ Todo.renderContext(1600)                               │
│       │  → Returns current task + 5 pending (1200 tokens)       │
│       └─ SubAgent.renderContext(800)                            │
│          → Returns 2 active subagents (400 tokens)              │
│                                                                  │
│    Total: 5800 tokens (within budget)                           │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. CONTEXT ASSEMBLY                                              │
│                                                                  │
│    Final Context:                                                │
│    ┌─────────────────────────────────────────────────────────┐ │
│    │ System Prompt (800 tokens)                               │ │
│    │ You are an AI agent that helps with coding tasks...     │ │
│    ├─────────────────────────────────────────────────────────┤ │
│    │ Memory Context (1400 tokens)                             │ │
│    │ ## Long-term Memory                                      │ │
│    │ - Previously implemented JWT authentication              │ │
│    │ - User prefers TypeScript with Express                   │ │
│    ├─────────────────────────────────────────────────────────┤ │
│    │ Working History (2800 tokens)                            │ │
│    │ user: Create a REST API                                  │ │
│    │ assistant: I'll help you create a REST API...            │ │
│    ├─────────────────────────────────────────────────────────┤ │
│    │ Todo Context (1200 tokens)                               │ │
│    │ ## Current Task                                          │ │
│    │ Implement authentication (Priority: 8)                   │ │
│    ├─────────────────────────────────────────────────────────┤ │
│    │ Current Request (800 tokens)                             │ │
│    │ Create a REST API with authentication                    │ │
│    └─────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. MODEL SELECTION                                               │
│                                                                  │
│    ModelRouter.selectModel({                                     │
│      taskComplexity: 'complex',                                  │
│      estimatedTokens: 5800,                                      │
│      qualityRequirement: 'high'                                  │
│    })                                                            │
│    ↓                                                             │
│    Decision: Use GPT-4 (Tier 1 - Strong Model)                  │
│    Reason: Complex code generation task                          │
│    Estimated cost: $0.12                                         │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. LLM API CALL                                                  │
│                                                                  │
│    Event: llm:call_started                                       │
│    ↓                                                             │
│    OpenAIProvider.call({                                         │
│      model: 'gpt-4',                                             │
│      messages: [...context],                                     │
│      tools: [FileSystemTool, CodeAnalysisTool, ...]             │
│    })                                                            │
│    ↓                                                             │
│    [Network Request to OpenAI API]                               │
│    ↓                                                             │
│    Response received (3.2s latency)                              │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. LLM RESPONSE PROCESSING                                       │
│                                                                  │
│    Response: {                                                   │
│      content: "I'll help you create a REST API...",             │
│      toolCalls: [                                                │
│        { name: "create_file", input: {...} }                    │
│      ]                                                           │
│    }                                                             │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. TOOL EXECUTION (if requested)                                │
│                                                                  │
│    For each tool call:                                           │
│    ├─ Validate input against schema                             │
│    ├─ Execute tool with timeout                                 │
│    ├─ Capture output/errors                                     │
│    └─ Emit tool:executed event                                  │
│                                                                  │
│    If tools executed → Loop back to step 5 (rebuild context)    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. COMPONENT STATE UPDATES                                      │
│                                                                  │
│    Components process LLM response:                              │
│    ├─ WorkingHistory: Add assistant message                     │
│    ├─ Memory: Check if compression needed                       │
│    ├─ Todo: Update task status if mentioned                     │
│    └─ SubAgent: Track any subagent completions                  │
│                                                                  │
│    Each emits: component:state_updated                           │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 12. STATE PERSISTENCE                                            │
│                                                                  │
│    Storage.saveAgentState()                                      │
│    ├─ Save agent state to SQLite                                │
│    ├─ Save component states                                     │
│    └─ Save events                                                │
│                                                                  │
│    All data persisted to: agent.db                               │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 13. LIFECYCLE TRANSITION                                         │
│                                                                  │
│    State: running → completed                                    │
│    Event: lifecycle:state_changed                                │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ 14. RETURN RESULT                                                │
│                                                                  │
│    Return to user: {                                             │
│      result: "REST API implementation...",                       │
│      cost: 0.12,                                                 │
│      tokens: { input: 5800, output: 2000, total: 7800 }         │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘

## Event Flow Timeline

```
Time  Event                           Component         Action
────────────────────────────────────────────────────────────────────
0ms   lifecycle:state_changed         Agent            idle → running
1ms   component:initialized           WorkingHistory   Load state
1ms   component:initialized           Memory           Load state
1ms   component:initialized           Todo             Load state
2ms   context:built                   ContextBuilder   Assembled 5800 tokens
3ms   llm:call_started                ModelRouter      Selected gpt-4
3200ms llm:call_completed             ModelRouter      Cost: $0.12
3201ms component:state_updated        WorkingHistory   Added message
3202ms component:state_updated        Memory           Compression check
3203ms component:state_updated        Todo             Task updated
3204ms lifecycle:state_changed        Agent            running → completed
```

## Data Persistence Flow

```
┌─────────────┐
│   Agent     │
│   State     │
└──────┬──────┘
       ↓
┌─────────────────────────────────────┐
│         SQLite Database             │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  agent_states               │   │
│  │  ├─ id                      │   │
│  │  ├─ agent_id                │   │
│  │  ├─ state (JSON)            │   │
│  │  └─ created_at              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  component_states           │   │
│  │  ├─ id                      │   │
│  │  ├─ agent_id                │   │
│  │  ├─ component_name          │   │
│  │  ├─ state (JSON)            │   │
│  │  └─ created_at              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  events                     │   │
│  │  ├─ id                      │   │
│  │  ├─ agent_id                │   │
│  │  ├─ event_type              │   │
│  │  ├─ event_data (JSON)       │   │
│  │  └─ created_at              │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Component Interaction Patterns

### Pattern 1: Event-Driven Updates

```
User Message
    ↓
WorkingHistory.addMessage()
    ↓
Emit: component:state_updated
    ↓
Memory.onEvent() → Check compression
    ↓
If needed: Compress and emit event
```

### Pattern 2: Context Contribution

```
Agent.execute()
    ↓
ContextBuilder.build()
    ↓
For each component:
    ↓
Component.renderContext(budget)
    ↓
Return ContextFragment
    ↓
Assemble all fragments
```

### Pattern 3: State Persistence

```
Component state changes
    ↓
Component.setState()
    ↓
Emit: component:state_updated
    ↓
Storage.set(component.name, state)
    ↓
SQLite INSERT
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ ERROR OCCURS                                                     │
│                                                                  │
│ Possible sources:                                                │
│ ├─ LLM API failure                                              │
│ ├─ Tool execution error                                         │
│ ├─ Component error                                              │
│ └─ Storage error                                                │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│ ERROR HANDLING                                                   │
│                                                                  │
│ 1. Emit error:occurred event                                     │
│ 2. Log error with context                                        │
│ 3. Attempt recovery:                                             │
│    ├─ LLM error → Try fallback model                            │
│    ├─ Tool error → Return error to LLM                          │
│    ├─ Component error → Skip component                          │
│    └─ Storage error → Use in-memory fallback                    │
│ 4. If unrecoverable → Transition to 'failed' state              │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Optimization Points

1. **Token Counting**: Pre-calculate for static content, cache results
2. **Context Building**: Parallel component rendering where possible
3. **Database**: Batch inserts for events, use indexes
4. **Caching**: Cache LLM responses for identical prompts
5. **Compression**: Lazy compression (only when needed)
6. **State Loading**: Lazy load component state on demand

## Scalability Considerations

### Horizontal Scaling

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Worker 1 │  │ Worker 2 │  │ Worker 3 │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┴─────────────┘
                   ↓
         ┌─────────────────┐
         │  Shared Storage │
         │    (SQLite)     │
         └─────────────────┘
```

### State Synchronization

```
Agent 1 (Local)  →  Sync  →  Cloud Storage  ←  Sync  ←  Agent 2 (Remote)
     ↓                                                        ↓
  Local DB                                                Local DB
```

## Summary

The data flow is designed to be:
- **Observable**: Every action emits events
- **Persistent**: All state saved to SQLite
- **Recoverable**: Snapshots enable state restoration
- **Efficient**: Token budgets prevent waste
- **Scalable**: Event-driven architecture supports distribution

Key insight: The event bus is the central nervous system, enabling loose coupling while maintaining full observability.
