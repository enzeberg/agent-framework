import { Database } from 'bun:sqlite'
import type { AgentEvent, ComponentState } from '../types'

export interface StorageConfig {
  dbPath: string
  agentId: string
}

export class Storage {
  private db: Database
  private agentId: string
  
  constructor(config: StorageConfig) {
    this.db = new Database(config.dbPath)
    this.agentId = config.agentId
    this.initTables()
  }
  
  private initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS component_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        component_name TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_agent_states ON agent_states(agent_id, created_at)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_component_states ON component_states(agent_id, component_name, created_at)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_events ON events(agent_id, event_type, created_at)')
  }
  
  async get(componentName: string): Promise<ComponentState | null> {
    const stmt = this.db.query(`
      SELECT state FROM component_states 
      WHERE agent_id = ? AND component_name = ? 
      ORDER BY created_at DESC LIMIT 1
    `)
    const row = stmt.get(this.agentId, componentName) as { state: string } | null
    return row ? JSON.parse(row.state) : null
  }
  
  async set(componentName: string, state: ComponentState): Promise<void> {
    const stmt = this.db.query(`
      INSERT INTO component_states (agent_id, component_name, state, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(this.agentId, componentName, JSON.stringify(state), Date.now())
  }
  
  async saveAgentState(state: any): Promise<void> {
    const stmt = this.db.query(`
      INSERT INTO agent_states (agent_id, state, created_at)
      VALUES (?, ?, ?)
    `)
    stmt.run(this.agentId, JSON.stringify(state), Date.now())
  }
  
  async getAgentState(): Promise<any | null> {
    const stmt = this.db.query(`
      SELECT state FROM agent_states 
      WHERE agent_id = ? 
      ORDER BY created_at DESC LIMIT 1
    `)
    const row = stmt.get(this.agentId) as { state: string } | null
    return row ? JSON.parse(row.state) : null
  }
  
  async saveEvent(event: AgentEvent): Promise<void> {
    const stmt = this.db.query(`
      INSERT INTO events (agent_id, event_type, event_data, created_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(this.agentId, event.type, JSON.stringify(event), event.timestamp)
  }
  
  async getEvents(filter?: { type?: string; since?: number; limit?: number }): Promise<AgentEvent[]> {
    let query = 'SELECT event_data FROM events WHERE agent_id = ?'
    const params: any[] = [this.agentId]
    
    if (filter?.type) {
      query += ' AND event_type = ?'
      params.push(filter.type)
    }
    
    if (filter?.since) {
      query += ' AND created_at >= ?'
      params.push(filter.since)
    }
    
    query += ' ORDER BY created_at DESC'
    
    if (filter?.limit) {
      query += ' LIMIT ?'
      params.push(filter.limit)
    }
    
    const stmt = this.db.query(query)
    const rows = stmt.all(...params) as { event_data: string }[]
    return rows.map(row => JSON.parse(row.event_data))
  }
  
  exportState(): any {
    const agentState = this.getAgentState()
    const stmt = this.db.query(`
      SELECT DISTINCT component_name FROM component_states WHERE agent_id = ?
    `)
    const components = stmt.all(this.agentId) as { component_name: string }[]
    
    const componentStates: Record<string, any> = {}
    for (const { component_name } of components) {
      componentStates[component_name] = this.get(component_name)
    }
    
    return {
      agentId: this.agentId,
      agentState,
      componentStates,
      exportedAt: Date.now()
    }
  }
  
  importState(data: any): void {
    if (data.agentState) {
      this.saveAgentState(data.agentState)
    }
    
    if (data.componentStates) {
      for (const [name, state] of Object.entries(data.componentStates)) {
        this.set(name, state as ComponentState)
      }
    }
  }
  
  close(): void {
    this.db.close()
  }
}
