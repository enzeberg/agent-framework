# Model Router Design

## Overview

The Model Router intelligently selects the most appropriate LLM model based on task requirements, cost constraints, and performance needs. It balances quality, cost, and latency to optimize agent performance.

**Implementation:** `src/core/model-router.ts`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Model Router                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Task Analyzer                               │ │
│  │  (complexity, token estimate, quality needs)        │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Selection Strategy                          │ │
│  │  (cost-based, quality-based, latency-based)         │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Provider Manager                            │ │
│  │  (health check, rate limiting, fallback)            │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌──────────┬──────────┬──────────┬──────────────────┐ │
│  │ OpenAI   │Anthropic │  Ollama  │  Custom Provider │ │
│  └──────────┴──────────┴──────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Model Tiers

### Tier 1: Strong Models (Complex Reasoning)

**Use Cases:**
- Complex code generation
- Multi-step reasoning
- Critical decision making
- Novel problem solving

**Models:**
- GPT-4 Turbo (OpenAI)
- Claude 3 Opus (Anthropic)
- Claude 3.5 Sonnet (Anthropic)

**Characteristics:**
- High quality output
- High cost ($10-30 per 1M tokens)
- Moderate latency (2-5s)

### Tier 2: Balanced Models (General Tasks)

**Use Cases:**
- Standard code generation
- Text summarization
- General Q&A
- Tool selection

**Models:**
- GPT-3.5 Turbo (OpenAI)
- Claude 3 Haiku (Anthropic)
- GPT-4 Mini (OpenAI)

**Characteristics:**
- Good quality output
- Low cost ($0.5-2 per 1M tokens)
- Low latency (0.5-2s)

### Tier 3: Fast Models (Simple Tasks)

**Use Cases:**
- Simple text processing
- Classification
- Extraction
- Validation

**Models:**
- Llama 3 8B (Ollama)
- Mistral 7B (Ollama)
- Phi-3 (Ollama)

**Characteristics:**
- Acceptable quality
- Very low cost (free for local)
- Very low latency (<0.5s)

## Selection Algorithm

### Input Criteria

The router considers multiple factors when selecting a model:
- Task type (generation, analysis, reasoning, simple)
- Estimated token count
- Task complexity (simple, medium, complex)
- Quality requirements (low, medium, high)
- Latency requirements (low, medium, high)
- Cost constraints (max cost per request)
- Previous attempts (for fallback logic)
- Available budget

See `ModelSelectionCriteria` interface in `src/types/index.ts`

### Decision Tree

```
START
  │
  ├─ Is complexity === 'complex'?
  │   YES → Use Tier 1 (Strong Model)
  │   NO  → Continue
  │
  ├─ Is qualityRequirement === 'high'?
  │   YES → Use Tier 1 (Strong Model)
  │   NO  → Continue
  │
  ├─ Is costConstraint < $0.01?
  │   YES → Use Tier 3 (Fast Model)
  │   NO  → Continue
  │
  ├─ Is latencyRequirement === 'low'?
  │   YES → Use Tier 3 (Fast Model)
  │   NO  → Continue
  │
  ├─ Is estimatedTokens > 10000?
  │   YES → Use Tier 2 (Balanced Model)
  │   NO  → Continue
  │
  └─ Default → Use Tier 2 (Balanced Model)
```

### Complexity Detection

The router automatically detects task complexity based on:

**Complex indicators:**
- Keywords: design, architect, implement, refactor, optimize, debug, analyze deeply
- Large context size (>10000 chars)
- Multi-step reasoning required

**Simple indicators:**
- Keywords: list, show, get, find, check, validate, format
- Small context size
- Single-step operations

**Default:** Medium complexity for ambiguous cases

See `detectComplexity()` method in `src/core/model-router.ts`

## Provider Management

### Provider Interface

Each LLM provider implements a standard interface with:
- Model information (context window, costs, limits)
- Availability checking
- API call execution
- Cost estimation

### Health Monitoring

The router tracks provider health:
- Periodic health checks (every 60s)
- Error rate tracking (last 100 requests)
- Latency monitoring (p50, p95, p99)
- Rate limit tracking
- Automatic circuit breaker on high error rate

### Fallback Strategy

**Fallback Logic:**
1. Try primary model
2. Check if error is retryable (rate limit, timeout)
3. Retry with exponential backoff (up to maxRetries)
4. Try next model in fallback chain
5. Repeat until success or chain exhausted
6. Return error with details

**Example Fallback Chains:**
- Quality-focused: gpt-4 → claude-3-opus → gpt-3.5-turbo
- Cost-focused: gpt-3.5-turbo → claude-3-haiku → llama-3-8b
- Speed-focused: llama-3-8b → gpt-3.5-turbo → claude-3-haiku

**Implementation:** See `ModelRouter` class in `src/core/model-router.ts`

## Rate Limiting

### Token Bucket Algorithm

The router implements token bucket rate limiting to respect provider limits:
- Each provider has a capacity (max tokens)
- Tokens refill at a constant rate
- Requests consume tokens
- Requests wait if insufficient tokens

### Per-Provider Rate Limits

Different providers have different limits:
- **OpenAI**: Varies by model and tier (e.g., GPT-4: 500 req/min, 150k tokens/min)
- **Anthropic**: Varies by model (e.g., Claude Opus: 50 req/min, 40k tokens/min)
- **Ollama**: No rate limits (local models)

The router automatically respects these limits to avoid API errors.

## Cost Tracking

### Cost Calculator

Tracks costs across all LLM calls:
- Calculate cost per call (input + output tokens)
- Track total cost
- Track cost by model
- Track cost by component (optional)

### Budget Management

Helps stay within budget:
- Set total budget limit
- Check if request is affordable before calling
- Allocate budget per model
- Get remaining budget
- Alert when approaching limit

**Implementation:** See `ModelRouter.trackCost()` and related methods

## Caching Strategy

### Response Caching

Cache LLM responses to save costs and improve latency:
- Generate cache key from (model + prompt hash)
- Store responses with metadata (timestamp, hits)
- Return cached response for identical requests
- Configurable TTL (time-to-live)
- LRU eviction when cache is full

**Cache Invalidation:**
- TTL-based: Expire after N minutes
- LRU: Remove least recently used
- Manual: Invalidate on component state changes

### Prompt Caching (Provider-Specific)

Some providers (e.g., Anthropic) support prompt caching:
- Cache static prefix of prompts
- Reduce costs for repeated context
- Configurable minimum prefix length
- Automatic cache key management

**Implementation:** See caching logic in `ModelRouter` class

## Configuration

### Router Configuration

Key configuration options:
- Default and fallback models
- Selection strategy (cost/quality/speed/balanced)
- Cost and latency constraints
- Provider configurations (API keys, endpoints, models)
- Caching settings (enabled, TTL)
- Rate limiting settings
- Fallback settings (enabled, max retries)

See `ModelRouterConfig` interface in `src/core/model-router.ts`

### Example Usage

```typescript
const router = new ModelRouter({
  defaultModel: 'gpt-3.5-turbo',
  fallbackModel: 'claude-3-haiku',
  strategy: 'balanced',
  maxCostPerRequest: 0.10,
  providers: [
    { name: 'openai', models: ['gpt-4', 'gpt-3.5-turbo'], enabled: true },
    { name: 'anthropic', models: ['claude-3-sonnet'], enabled: true }
  ]
})

// Automatic model selection
const model = router.selectModel({
  complexity: 'medium',
  qualityRequirement: 'high'
})
```

## Monitoring & Metrics

### Key Metrics

The router tracks:
- Total requests and requests by model/provider
- Average latency and latency by model
- Total cost and cost by model
- Success rate, error rate, fallback rate
- Cache hit rate and cache savings

### Best Practices

1. Start with balanced strategy for most use cases
2. Set cost constraints to avoid surprises
3. Enable caching to save 30-50% on repeated queries
4. Monitor metrics regularly
5. Configure fallback chains for reliability
6. Use local models (Ollama) for development
7. Tune complexity detection for your domain
8. Set up budget alerts
9. Regular health checks prevent cascading failures
10. Test fallback chains before production
