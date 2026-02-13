import type { AgentEvent } from '../types'

type EventHandler = (event: AgentEvent) => void | Promise<void>

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private allHandlers: Set<EventHandler> = new Set()
  private eventHistory: AgentEvent[] = []
  private maxHistory: number = 1000
  
  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)
  }
  
  onAny(handler: EventHandler): void {
    this.allHandlers.add(handler)
  }
  
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
    }
  }
  
  offAny(handler: EventHandler): void {
    this.allHandlers.delete(handler)
  }
  
  async emit(event: AgentEvent): Promise<void> {
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift()
    }
    
    const handlers = this.handlers.get(event.type) || new Set()
    const allHandlers = [...handlers, ...this.allHandlers]
    
    await Promise.all(allHandlers.map(handler => handler(event)))
  }
  
  getHistory(filter?: (event: AgentEvent) => boolean): AgentEvent[] {
    if (filter) {
      return this.eventHistory.filter(filter)
    }
    return [...this.eventHistory]
  }
  
  clearHistory(): void {
    this.eventHistory = []
  }
  
  async replay(events: AgentEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event)
    }
  }
}
