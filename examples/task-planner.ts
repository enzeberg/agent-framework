import { Agent, WorkingHistory, Memory, Todo, ModelRouter } from '../src'

async function main() {
  console.log('🚀 Task Planner Agent Example\n')
  
  const modelRouter = new ModelRouter({
    strategy: 'balanced',
    maxCostPerRequest: 0.10,
  })
  
  const agent = new Agent({
    name: 'TaskPlanner',
    components: [
      new WorkingHistory({ maxMessages: 50 }),
      new Memory({ compressionInterval: 20 }),
      new Todo({ autoDecompose: true })
    ],
    modelRouter,
    systemPrompt: 'You are a task planning assistant that helps break down complex projects into manageable tasks.',
    maxTokens: 8000,
    dbPath: './data/task-planner.db'
  })
  
  agent.on('lifecycle:state_changed', (event) => {
    if (event.type === 'lifecycle:state_changed') {
      console.log(`📊 State: ${event.from} → ${event.to}`)
    }
  })
  
  agent.on('llm:call_completed', (event) => {
    if (event.type === 'llm:call_completed') {
      console.log(`💰 Cost: $${event.cost.toFixed(4)} | Tokens: ${event.tokens.total}`)
    }
  })
  
  await agent.init()
  console.log('✅ Agent initialized\n')
  
  const task = 'Create a project plan for building a REST API with authentication, user management, and data persistence'
  console.log(`📝 Task: ${task}\n`)
  
  const result = await agent.execute(task)
  console.log(`\n✨ Result: ${result}`)
  
  console.log(`\n📈 Total Cost: $${agent.getCost().toFixed(4)}`)
  console.log(`📊 Token Usage:`, agent.getTokenUsage())
  
  const snapshot = await agent.takeSnapshot()
  console.log(`\n💾 Snapshot saved (${JSON.stringify(snapshot).length} bytes)`)
  
  await agent.stop()
  console.log('\n✅ Agent stopped')
}

main().catch(console.error)
