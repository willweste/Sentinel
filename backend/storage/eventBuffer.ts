/**
 * In-memory event buffer for storing and retrieving request events
 * Implements a simple time-window based retention strategy
 */

export interface StoredEvent {
  timestamp: string
  tenant_id: string
  endpoint: string
  method: string
  status_code: number
  latency_ms: number
  service: string
}

class EventBuffer {
  private events: StoredEvent[] = []
  private retentionMs: number
  private cleanupIntervalMs: number
  private cleanupTimer?: NodeJS.Timeout

  constructor(retentionMinutes: number = 15, cleanupIntervalMinutes: number = 1) {
    this.retentionMs = retentionMinutes * 60 * 1000
    this.cleanupIntervalMs = cleanupIntervalMinutes * 60 * 1000
    this.startCleanupTimer()
  }

  /**
   * Add a new event to the buffer
   */
  addEvent(event: StoredEvent): void {
    this.events.push(event)
  }

  /**
   * Get all events within a time window (in minutes from now)
   * @param windowMinutes - How many minutes back to retrieve events
   */
  getEventsInWindow(windowMinutes: number): StoredEvent[] {
    const cutoffTime = Date.now() - windowMinutes * 60 * 1000
    return this.events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime()
      return eventTime >= cutoffTime
    })
  }

  /**
   * Get all events (for debugging)
   */
  getAllEvents(): StoredEvent[] {
    return [...this.events]
  }

  /**
   * Get events count
   */
  getEventCount(): number {
    return this.events.length
  }

  /**
   * Remove events older than retention period
   */
  cleanup(): number {
    const cutoffTime = Date.now() - this.retentionMs
    const initialCount = this.events.length

    this.events = this.events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime()
      return eventTime >= cutoffTime
    })

    const removedCount = initialCount - this.events.length
    if (removedCount > 0) {
      console.log(`[EventBuffer] Cleaned up ${removedCount} old events (retention: ${this.retentionMs / 60000}min)`)
    }

    return removedCount
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.cleanupIntervalMs)

    // Allow Node to exit even if timer is running
    this.cleanupTimer.unref()
  }

  /**
   * Stop automatic cleanup (for testing/shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = []
  }
}

// Singleton instance with 15-minute retention
export const eventBuffer = new EventBuffer(15, 1)
