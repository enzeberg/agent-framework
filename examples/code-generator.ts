import { Agent, WorkingHistory, Memory, SubAgent, ModelRouter } from '../src'

async function main() {
  console.log('🚀 Code Generator Agent Example\n')
  
  const modelRouter = new ModelRouter({
    defaultModel: 'gpt-4',
    fallbackModel: 'gpt-3.5-turbo',
    strategy: 'quality',
    maxCostPerRequest: 0.50,
    providers: [
      {
        name: 'openai',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        enabled: true
      },
      {
        name: 'anthropic',
        models: ['claude-3-sonnet', 'claude-3-haiku'],
        enabled: true
      }
    ]
  })
  
  const agent = new Agent({
    name: 'CodeGenerator',
    components: [
      new WorkingHistory({ maxMessages: 30 }),
      new Memory({ compressionInterval: 15 }),
      new SubAgent({ maxConcurrent: 3 })
    ],
    modelRouter,
    systemPrompt: 'You are a code generation assistant that creates high-quality, well-documented code.',
    maxTokens: 12000,
    dbPath: './data/code-generator.db'
  })
  
  agent.on('lifecycle:state_changed', (event) => {
    if (event.type === 'lifecycle:state_changed') {
      console.log(`📊 State: ${event.from} → ${event.to}`)
    }
  })
  
  agent.on('llm:call_started', (event) => {
    if (event.type === 'llm:call_started') {
      console.log(`🤖 Calling ${event.model}...`)
    }
  })
  
  agent.on('llm:call_completed', (event) => {
    if (event.type === 'llm:call_completed') {
      console.log(`✅ Completed | Cost: $${event.cost.toFixed(4)} | Tokens: ${event.tokens.total}`)
    }
  })
  
  await agent.init()
  console.log('✅ Agent initialized\n')
  
  const task = 'Generate a TypeScript REST API with JWT authentication, including user registration, login, and protected routes'
  console.log(`📝 Task: ${task}\n`)
  
  const result = await agent.execute(task)
  console.log(`\n✨ Result: ${result}`)
  
  console.log(`\n📈 Total Cost: $${agent.getCost().toFixed(4)}`)
  console.log(`📊 Token Usage:`, agent.getTokenUsage())
  
  const costByModel = modelRouter.getCostByModel()
  console.log('\n💰 Cost by Model:')
  for (const [model, cost] of costByModel) {
    console.log(`  ${model}: $${cost.toFixed(4)}`)
  }
  
  await agent.stop()
  console.log('\n✅ Agent stopped')
}

main().catch(console.error)
