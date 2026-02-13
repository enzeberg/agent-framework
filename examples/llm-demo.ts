#!/usr/bin/env bun

/**
 * LLM Demo - Real LLM calls with tool-calling loop
 *
 * Prerequisites:
 *   1. Copy .env.example to .env and set at least one API key
 *   2. Run: bun examples/llm-demo.ts
 *
 * This demo shows:
 *   - Automatic provider detection from .env (OpenAI / Anthropic / Gemini)
 *   - Tool definitions and automatic tool calling
 *   - Multi-round tool-call loop (LLM → tool → LLM → ...)
 *   - Token usage and cost tracking
 */

import { Agent, WorkingHistory, Memory, Todo, ModelRouter, type Tool } from '../src'

// ─── Define Tools ────────────────────────────────────────────

const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time in ISO format',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute() {
    return { time: new Date().toISOString() }
  },
}

const calculateTool: Tool = {
  name: 'calculate',
  description: 'Evaluate a mathematical expression and return the result',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The math expression to evaluate, e.g. "2 + 3 * 4"',
      },
    },
    required: ['expression'],
  },
  async execute(input: { expression: string }) {
    try {
      const result = Function(`"use strict"; return (${input.expression})`)()
      return { expression: input.expression, result }
    } catch {
      return { error: `Cannot evaluate: ${input.expression}` }
    }
  },
}

const searchKnowledgeTool: Tool = {
  name: 'search_knowledge',
  description: 'Search a mock knowledge base for information on a topic',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
    },
    required: ['query'],
  },
  async execute(input: { query: string }) {
    const knowledge: Record<string, string> = {
      'typescript': 'TypeScript is a strongly-typed superset of JavaScript developed by Microsoft.',
      'bun': 'Bun is an all-in-one JavaScript runtime with a bundler, transpiler, task runner, and npm-compatible package manager.',
      'agent': 'An AI agent is an autonomous system that uses LLMs to reason, plan, and take actions through tool use.',
    }
    const key = Object.keys(knowledge).find(k => input.query.toLowerCase().includes(k))
    if (key) return { found: true, topic: key, content: knowledge[key] }
    return { found: false, message: `No results found for: ${input.query}` }
  },
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║      Agent Framework - Real LLM + Tool Calling Demo       ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()

  // ModelRouter auto-detects providers from .env
  const modelRouter = new ModelRouter({
    strategy: 'balanced',
    maxCostPerRequest: 0.50,
  })

  if (!modelRouter.hasAvailableProviders()) {
    console.error('❌ No LLM provider configured.')
    console.error('💡 Copy .env.example to .env and set at least one API key:')
    console.error('   OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY')
    process.exit(1)
  }

  const agent = new Agent({
    name: 'LLMDemoAgent',
    components: [
      new WorkingHistory({ maxMessages: 50 }),
      new Memory({ compressionInterval: 20 }),
      new Todo({ autoDecompose: true }),
    ],
    modelRouter,
    tools: [getCurrentTimeTool, calculateTool, searchKnowledgeTool],
    systemPrompt: 'You are a helpful AI assistant with access to tools. Use tools when they can help answer the user\'s question. Be concise in your responses.',
    maxTokens: 4000,
    maxToolRounds: 5,
    dbPath: './data/llm-demo.db',
  })

  // Event listeners
  agent.on('llm:call_started', (event) => {
    if (event.type === 'llm:call_started') {
      console.log(`🤖 Calling LLM (${event.model} via ${event.provider})...`)
    }
  })

  agent.on('llm:call_completed', (event) => {
    if (event.type === 'llm:call_completed') {
      console.log(`✅ LLM responded | Tokens: ${event.tokens.total} (in: ${event.tokens.input}, out: ${event.tokens.output})`)
    }
  })

  agent.on('tool:executed', (event) => {
    if (event.type === 'tool:executed') {
      console.log(`🔧 Tool [${event.tool}] executed in ${event.duration}ms`)
      console.log(`   Input:  ${JSON.stringify(event.input)}`)
      console.log(`   Output: ${JSON.stringify(event.output).slice(0, 200)}`)
    }
  })

  agent.on('lifecycle:state_changed', (event) => {
    if (event.type === 'lifecycle:state_changed') {
      console.log(`📊 State: ${event.from} → ${event.to}`)
    }
  })

  console.log('🔧 Initializing agent...')
  await agent.init()
  console.log('✅ Agent initialized')
  console.log()

  const task = 'What time is it right now? Also, what is 123 * 456 + 789? Finally, tell me about TypeScript.'

  console.log(`📝 Task: "${task}"`)
  console.log('─'.repeat(60))
  console.log()

  const result = await agent.execute(task)

  console.log()
  console.log('✨ Final Answer:')
  console.log('─'.repeat(60))
  console.log(result)
  console.log('─'.repeat(60))
  console.log()

  console.log('📈 Statistics:')
  const usage = agent.getTokenUsage()
  console.log(`   Tokens: ${usage.total} (in: ${usage.input}, out: ${usage.output})`)
  console.log(`   Cost:   $${agent.getCost().toFixed(4)}`)
  console.log()

  await agent.stop()
  console.log('✅ Agent stopped')
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
