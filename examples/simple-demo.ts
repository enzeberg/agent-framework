#!/usr/bin/env bun

import { Agent, WorkingHistory, Memory, Todo, ModelRouter } from '../src'

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║         Agent Framework - Simple Demo                      ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log()

async function demo() {
  console.log('📦 Creating agent with components...')
  
  const modelRouter = new ModelRouter({
    strategy: 'balanced',
    maxCostPerRequest: 0.10,
  })
  
  const agent = new Agent({
    name: 'DemoAgent',
    components: [
      new WorkingHistory({ maxMessages: 20 }),
      new Memory({ compressionInterval: 10 }),
      new Todo({ autoDecompose: true })
    ],
    modelRouter,
    systemPrompt: 'You are a helpful AI assistant that demonstrates the agent framework capabilities.',
    maxTokens: 8000,
    dbPath: './data/demo.db'
  })
  
  console.log('✅ Agent created')
  console.log()
  
  console.log('🔧 Initializing components...')
  await agent.init()
  console.log('✅ Components initialized')
  console.log()
  
  let eventCount = 0
  agent.on('lifecycle:state_changed', (event) => {
    if (event.type === 'lifecycle:state_changed') {
      eventCount++
      console.log(`📊 [Event ${eventCount}] State: ${event.from} → ${event.to}`)
    }
  })
  
  agent.on('llm:call_started', (event) => {
    if (event.type === 'llm:call_started') {
      eventCount++
      console.log(`📊 [Event ${eventCount}] LLM Call Started: ${event.model}`)
    }
  })
  
  agent.on('llm:call_completed', (event) => {
    if (event.type === 'llm:call_completed') {
      eventCount++
      console.log(`📊 [Event ${eventCount}] LLM Call Completed`)
      console.log(`   💰 Cost: $${event.cost.toFixed(4)}`)
      console.log(`   📝 Tokens: ${event.tokens.total} (in: ${event.tokens.input}, out: ${event.tokens.output})`)
    }
  })
  
  agent.on('component:state_updated', (event) => {
    if (event.type === 'component:state_updated') {
      eventCount++
      console.log(`📊 [Event ${eventCount}] Component Updated: ${event.component}`)
    }
  })
  
  console.log('🚀 Executing task...')
  console.log()
  
  const task = 'Analyze the benefits of using a component-based architecture for AI agents'
  console.log(`📝 Task: "${task}"`)
  console.log()
  
  const result = await agent.execute(task)
  
  console.log()
  console.log('✨ Result:')
  console.log('─'.repeat(60))
  console.log(result)
  console.log('─'.repeat(60))
  console.log()
  
  console.log('📈 Final Statistics:')
  console.log('─'.repeat(60))
  
  const usage = agent.getTokenUsage()
  console.log(`📝 Total Tokens: ${usage.total}`)
  console.log(`   ├─ Input:  ${usage.input}`)
  console.log(`   └─ Output: ${usage.output}`)
  console.log()
  
  const cost = agent.getCost()
  console.log(`💰 Total Cost: $${cost.toFixed(4)}`)
  console.log()
  
  const costByModel = modelRouter.getCostByModel()
  console.log(`📊 Cost by Model:`)
  for (const [model, modelCost] of costByModel) {
    console.log(`   ├─ ${model}: $${modelCost.toFixed(4)}`)
  }
  console.log()
  
  console.log(`🎯 Total Events: ${eventCount}`)
  console.log('─'.repeat(60))
  console.log()
  
  console.log('💾 Taking snapshot...')
  const snapshot = await agent.takeSnapshot()
  console.log(`✅ Snapshot saved (${JSON.stringify(snapshot).length} bytes)`)
  console.log()
  
  console.log('🛑 Stopping agent...')
  await agent.stop()
  console.log('✅ Agent stopped')
  console.log()
  
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║         Demo completed successfully! 🎉                    ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
}

demo().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
