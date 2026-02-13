import { describe, test, expect, beforeEach } from 'bun:test'
import { Agent, WorkingHistory, Memory, Todo, ModelRouter } from '../src'

describe('Agent', () => {
  let agent: Agent
  
  beforeEach(async () => {
    const modelRouter = new ModelRouter({
      defaultModel: 'gpt-3.5-turbo',
      fallbackModel: 'claude-3-haiku',
      strategy: 'balanced',
      maxCostPerRequest: 0.10,
      providers: [
        { name: 'openai', models: ['gpt-3.5-turbo'], enabled: true }
      ]
    })
    
    agent = new Agent({
      name: 'TestAgent',
      components: [
        new WorkingHistory(),
        new Memory(),
        new Todo()
      ],
      modelRouter,
      dbPath: ':memory:'
    })
    
    await agent.init()
  })
  
  test('initializes with idle state', () => {
    expect(agent.getState()).toBe('idle')
  })
  
  test('transitions to running on execute', async () => {
    let stateChanged = false
    
    agent.on('lifecycle:state_changed', (event) => {
      if (event.type === 'lifecycle:state_changed' && event.to === 'running') {
        stateChanged = true
      }
    })
    
    await agent.execute('Test task')
    expect(stateChanged).toBe(true)
  })
  
  test('tracks token usage', async () => {
    await agent.execute('Test task')
    const usage = agent.getTokenUsage()
    
    expect(usage.total).toBeGreaterThan(0)
    expect(usage.input).toBeGreaterThan(0)
  })
  
  test('tracks cost', async () => {
    await agent.execute('Test task')
    const cost = agent.getCost()
    
    expect(cost).toBeGreaterThan(0)
  })
  
  test('creates snapshot', async () => {
    await agent.execute('Test task')
    const snapshot = await agent.takeSnapshot()
    
    expect(snapshot).toBeDefined()
    expect(snapshot.agentId).toBe(agent.id)
  })
})

describe('WorkingHistory', () => {
  test('adds messages', async () => {
    const history = new WorkingHistory()
    
    // Mock context
    await history.init({
      agent: null as any,
      eventBus: { emit: () => {} } as any,
      storage: { get: async () => null, set: async () => {} } as any,
      logger: console
    })
    
    history.addMessage({
      role: 'user',
      content: 'Hello',
      important: false
    })
    
    expect(history.getMessages()).toHaveLength(1)
  })
  
  test('compresses when threshold reached', async () => {
    const history = new WorkingHistory({
      compressionThreshold: 5,
      keepRecentCount: 2
    })
    
    // Mock context
    await history.init({
      agent: null as any,
      eventBus: { emit: () => {} } as any,
      storage: { get: async () => null, set: async () => {} } as any,
      logger: console
    })
    
    for (let i = 0; i < 10; i++) {
      history.addMessage({
        role: 'user',
        content: `Message ${i}`,
        important: false
      })
    }
    
    const state = history.getState() as any
    expect(state.compressionCount).toBeGreaterThan(0)
  })
})

describe('Todo', () => {
  test('adds tasks', async () => {
    const todo = new Todo()
    
    // Mock context
    await todo.init({
      agent: null as any,
      eventBus: { emit: () => {} } as any,
      storage: { get: async () => null, set: async () => {} } as any,
      logger: console
    })
    
    const taskId = await todo.addTask({
      title: 'Test task',
      description: 'Test description',
      status: 'pending',
      priority: 5,
      dependencies: [],
      subtasks: [],
      parentTask: null,
      estimatedTokens: 100,
      actualTokens: 0,
      metadata: {}
    })
    
    expect(taskId).toBeDefined()
    expect(todo.getTasks()).toHaveLength(1)
  })
  
  test('updates task status', async () => {
    const todo = new Todo()
    
    // Mock context
    await todo.init({
      agent: null as any,
      eventBus: { emit: () => {} } as any,
      storage: { get: async () => null, set: async () => {} } as any,
      logger: console
    })
    
    const taskId = await todo.addTask({
      title: 'Test task',
      description: 'Test',
      status: 'pending',
      priority: 5,
      dependencies: [],
      subtasks: [],
      parentTask: null,
      estimatedTokens: 100,
      actualTokens: 0,
      metadata: {}
    })
    
    await todo.updateTaskStatus(taskId, 'in_progress')
    
    const task = todo.getTask(taskId)
    expect(task?.status).toBe('in_progress')
  })
  
  test('gets next task with no dependencies', async () => {
    const todo = new Todo()
    
    // Mock context
    await todo.init({
      agent: null as any,
      eventBus: { emit: () => {} } as any,
      storage: { get: async () => null, set: async () => {} } as any,
      logger: console
    })
    
    await todo.addTask({
      title: 'Task 1',
      description: 'Test',
      status: 'pending',
      priority: 5,
      dependencies: [],
      subtasks: [],
      parentTask: null,
      estimatedTokens: 100,
      actualTokens: 0,
      metadata: {}
    })
    
    const next = todo.getNextTask()
    expect(next).toBeDefined()
    expect(next?.title).toBe('Task 1')
  })
})

describe('ModelRouter', () => {
  test('selects model based on complexity', () => {
    const router = new ModelRouter({
      defaultModel: 'gpt-3.5-turbo',
      fallbackModel: 'claude-3-haiku',
      strategy: 'balanced',
      maxCostPerRequest: 0.10,
      providers: []
    })
    
    const model = router.selectModel({
      complexity: 'complex',
      qualityRequirement: 'high'
    })
    
    expect(model).toBe('claude-3-sonnet')
  })
  
  test('tracks cost', () => {
    const router = new ModelRouter({
      defaultModel: 'gpt-3.5-turbo',
      fallbackModel: 'claude-3-haiku',
      strategy: 'balanced',
      maxCostPerRequest: 0.10,
      providers: []
    })
    
    router.trackCost('gpt-4', 0.05)
    router.trackCost('gpt-4', 0.03)
    
    expect(router.getTotalCost()).toBe(0.08)
  })
})
