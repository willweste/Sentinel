/**
 * Redis-based event buffer for persistent storage across restarts
 * Uses Redis Sorted Sets for efficient time-window queries
 */

import { getRedisClient } from '../redis/client.js'

export interface StoredEvent {
  timestamp: string
  tenant_id: string
  endpoint: string
  method: string
  status_code: number
  latency_ms: number
  service: string
}

export class RedisEventBuffer {
  private redis: Awaited<ReturnType<typeof getRedisClient>>
  private ready: Promise<void>
  private retentionMs: number
  private cleanupIntervalMs: number
  private cleanupTimer?: NodeJS.Timeout
  private readonly redisKey = 'sentinel:events'

  constructor(retentionMinutes: number = 15, cleanupIntervalMinutes: number = 1) {
    this.retentionMs = retentionMinutes * 60 * 1000
    this.cleanupIntervalMs = cleanupIntervalMinutes * 60 * 1000
    this.ready = this.initialize()
  }

  private async initialize(): Promise<void> {
    this.redis = await getRedisClient()
    this.startCleanupTimer()
  }

  /**
   * Add a new event to Redis sorted set
   * Score = timestamp in milliseconds for efficient time-based queries
   */
  async addEvent(event: StoredEvent): Promise<void> {
    await this.ready

    try {
      const score = new Date(event.timestamp).getTime()
      const member = JSON.stringify(event)

      await this.redis.zAdd(this.redisKey, {
        score,
        value: member,
      })

      // Refresh TTL as safety net (2x retention period)
      await this.redis.expire(this.redisKey, Math.ceil((this.retentionMs / 1000) * 2))
    } catch (error) {
      console.error('[RedisEventBuffer] addEvent failed:', error)
      throw error
    }
  }

  /**
   * Get all events within a time window (in minutes from now)
   * @param windowMinutes - How many minutes back to retrieve events
   */
  async getEventsInWindow(windowMinutes: number): Promise<StoredEvent[]> {
    await this.ready

    try {
      const cutoffMs = Date.now() - windowMinutes * 60 * 1000

      const members = await this.redis.zRangeByScore(this.redisKey, cutoffMs, '+inf')

      return members
        .map((json) => this.deserializeEvent(json))
        .filter((event): event is StoredEvent => event !== null)
    } catch (error) {
      console.error('[RedisEventBuffer] getEventsInWindow failed:', error)
      return []
    }
  }

  /**
   * Get all events (for debugging)
   */
  async getAllEvents(): Promise<StoredEvent[]> {
    await this.ready

    try {
      const members = await this.redis.zRange(this.redisKey, 0, -1)

      return members
        .map((json) => this.deserializeEvent(json))
        .filter((event): event is StoredEvent => event !== null)
    } catch (error) {
      console.error('[RedisEventBuffer] getAllEvents failed:', error)
      return []
    }
  }

  /**
   * Get events count
   */
  async getEventCount(): Promise<number> {
    await this.ready

    try {
      return await this.redis.zCard(this.redisKey)
    } catch (error) {
      console.error('[RedisEventBuffer] getEventCount failed:', error)
      return 0
    }
  }

  /**
   * Remove events older than retention period
   */
  async cleanup(): Promise<number> {
    await this.ready

    try {
      const cutoffMs = Date.now() - this.retentionMs

      const removedCount = await this.redis.zRemRangeByScore(this.redisKey, '-inf', cutoffMs)

      if (removedCount > 0) {
        console.log(
          `[RedisEventBuffer] Cleaned up ${removedCount} old events (retention: ${this.retentionMs / 60000}min)`
        )
      }

      return removedCount
    } catch (error) {
      console.error('[RedisEventBuffer] cleanup failed:', error)
      return 0
    }
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
  async clear(): Promise<void> {
    await this.ready

    try {
      await this.redis.del(this.redisKey)
    } catch (error) {
      console.error('[RedisEventBuffer] clear failed:', error)
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        console.error('[RedisEventBuffer] Cleanup timer error:', err)
      })
    }, this.cleanupIntervalMs)

    // Allow Node to exit even if timer is running
    this.cleanupTimer.unref()
  }

  /**
   * Deserialize JSON to StoredEvent with validation
   */
  private deserializeEvent(json: string): StoredEvent | null {
    try {
      const event = JSON.parse(json)

      // Validate required fields
      if (!event.timestamp || !event.tenant_id) {
        console.warn('[RedisEventBuffer] Invalid event skipped:', json)
        return null
      }

      return event
    } catch (error) {
      console.error('[RedisEventBuffer] Deserialization failed:', error)
      return null
    }
  }
}

// Singleton instance with 15-minute retention
export const eventBuffer = new RedisEventBuffer(15, 1)
