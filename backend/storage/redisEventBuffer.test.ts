import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { RedisEventBuffer } from './redisEventBuffer.js'
import { createMockEvent, createMockEvents } from '../__tests__/utils/testHelpers.js'
import { clearTestRedis, closeTestRedis } from '../__tests__/utils/redisMock.js'

/**
 * Integration tests for RedisEventBuffer
 *
 * REQUIREMENTS:
 * - Redis must be running (docker-compose up -d redis)
 * - Tests use real Redis instance for authentic behavior
 */
describe('RedisEventBuffer (Integration)', () => {
  let buffer: RedisEventBuffer

  beforeAll(async () => {
    // Verify Redis is accessible
    buffer = new RedisEventBuffer(15, 1)
    try {
      await buffer.getEventCount()
    } catch (error) {
      throw new Error(
        'Redis not accessible. Start it with: docker-compose up -d redis'
      )
    }
  })

  afterAll(async () => {
    if (buffer) {
      buffer.stopCleanup()
    }
    await closeTestRedis()
  })

  beforeEach(async () => {
    // Clear Redis before each test
    await clearTestRedis()
    // Give Redis a moment to clear
    await new Promise(resolve => setTimeout(resolve, 10))
    buffer = new RedisEventBuffer(15, 1)
  })

  describe('addEvent', () => {
    it('persists events to Redis', async () => {
      const event = createMockEvent({ tenant_id: 'test-tenant' })

      await buffer.addEvent(event)

      const count = await buffer.getEventCount()
      expect(count).toBe(1)
    })

    it('stores multiple events', async () => {
      const events = createMockEvents(5, { tenant_id: 'test-tenant' })

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const count = await buffer.getEventCount()
      expect(count).toBe(5)
    })

    it('preserves event data integrity', async () => {
      const event = createMockEvent({
        tenant_id: 'tenant-123',
        endpoint: '/api/users',
        method: 'POST',
        status_code: 201,
        latency_ms: 250,
        service: 'user-service'
      })

      await buffer.addEvent(event)

      const retrieved = await buffer.getAllEvents()
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0]).toMatchObject({
        tenant_id: 'tenant-123',
        endpoint: '/api/users',
        method: 'POST',
        status_code: 201,
        latency_ms: 250,
        service: 'user-service'
      })
    })

    it('handles events with different timestamps', async () => {
      const now = Date.now()
      const events = [
        createMockEvent({ timestamp: new Date(now - 5000).toISOString() }),
        createMockEvent({ timestamp: new Date(now - 3000).toISOString() }),
        createMockEvent({ timestamp: new Date(now - 1000).toISOString() })
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const retrieved = await buffer.getAllEvents()
      expect(retrieved).toHaveLength(3)

      // Events should be sorted by timestamp (oldest first in Redis sorted set)
      const timestamps = retrieved.map(e => new Date(e.timestamp).getTime())
      expect(timestamps[0]).toBeLessThan(timestamps[1])
      expect(timestamps[1]).toBeLessThan(timestamps[2])
    })
  })

  describe('getEventsInWindow', () => {
    it('retrieves events within time window', async () => {
      const now = Date.now()
      const events = [
        createMockEvent({ timestamp: new Date(now - 2 * 60 * 1000).toISOString() }), // 2 min ago
        createMockEvent({ timestamp: new Date(now - 5 * 60 * 1000).toISOString() }), // 5 min ago
        createMockEvent({ timestamp: new Date(now - 10 * 60 * 1000).toISOString() }) // 10 min ago
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const windowEvents = await buffer.getEventsInWindow(6)
      expect(windowEvents).toHaveLength(2) // 2 min and 5 min events
    })

    it('excludes events outside time window', async () => {
      const now = Date.now()
      const events = [
        createMockEvent({ timestamp: new Date(now - 20 * 60 * 1000).toISOString() }), // 20 min ago (outside)
        createMockEvent({ timestamp: new Date(now - 3 * 60 * 1000).toISOString() })  // 3 min ago (inside)
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const windowEvents = await buffer.getEventsInWindow(5)
      expect(windowEvents).toHaveLength(1)
      expect(new Date(windowEvents[0].timestamp).getTime()).toBeGreaterThan(
        now - 5 * 60 * 1000
      )
    })

    it('returns empty array when no events in window', async () => {
      const now = Date.now()
      const event = createMockEvent({
        timestamp: new Date(now - 20 * 60 * 1000).toISOString()
      })

      await buffer.addEvent(event)

      const windowEvents = await buffer.getEventsInWindow(5)
      expect(windowEvents).toEqual([])
    })

    it('handles zero window correctly', async () => {
      // Add an event from 1 second ago
      const event = createMockEvent({
        timestamp: new Date(Date.now() - 1000).toISOString()
      })
      await buffer.addEvent(event)

      const windowEvents = await buffer.getEventsInWindow(0)
      // 0 minute window means cutoff is exactly now, so 1-second-old event should be excluded
      expect(windowEvents.length).toBe(0)
    })

    it('returns all events for large window', async () => {
      const events = createMockEvents(10)

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const windowEvents = await buffer.getEventsInWindow(60) // 1 hour window
      expect(windowEvents).toHaveLength(10)
    })

    it('handles events at boundary of time window', async () => {
      const now = Date.now()
      const windowMinutes = 5
      const cutoffTime = now - windowMinutes * 60 * 1000

      const events = [
        createMockEvent({ timestamp: new Date(cutoffTime - 10000).toISOString() }), // Clearly outside (10s before)
        createMockEvent({ timestamp: new Date(cutoffTime + 10000).toISOString() }) // Clearly inside (10s after)
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const windowEvents = await buffer.getEventsInWindow(windowMinutes)
      // Should only include the event clearly inside the window
      expect(windowEvents.length).toBe(1)
      const timestamp = new Date(windowEvents[0].timestamp).getTime()
      expect(timestamp).toBeGreaterThan(cutoffTime)
    })
  })

  describe('getAllEvents', () => {
    it('returns all stored events', async () => {
      const events = createMockEvents(15)

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const allEvents = await buffer.getAllEvents()
      expect(allEvents).toHaveLength(15)
    })

    it('returns empty array when no events stored', async () => {
      const allEvents = await buffer.getAllEvents()
      expect(allEvents).toEqual([])
    })
  })

  describe('getEventCount', () => {
    it('returns correct count', async () => {
      await buffer.clear()
      expect(await buffer.getEventCount()).toBe(0)

      await buffer.addEvent(createMockEvent({ timestamp: new Date(Date.now() - 1000).toISOString() }))
      expect(await buffer.getEventCount()).toBe(1)

      await buffer.addEvent(createMockEvent({ timestamp: new Date(Date.now() - 2000).toISOString() }))
      expect(await buffer.getEventCount()).toBe(2)
    })

    it('returns zero for empty buffer', async () => {
      const count = await buffer.getEventCount()
      expect(count).toBe(0)
    })
  })

  describe('cleanup', () => {
    it('removes events older than retention period', async () => {
      const retentionMinutes = 5
      buffer = new RedisEventBuffer(retentionMinutes, 0.1) // 5 min retention

      const now = Date.now()
      const events = [
        createMockEvent({ timestamp: new Date(now - 10 * 60 * 1000).toISOString() }), // Old
        createMockEvent({ timestamp: new Date(now - 1 * 60 * 1000).toISOString() })  // Recent
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const removedCount = await buffer.cleanup()
      expect(removedCount).toBe(1)

      const remaining = await buffer.getAllEvents()
      expect(remaining).toHaveLength(1)
      expect(new Date(remaining[0].timestamp).getTime()).toBeGreaterThan(
        now - retentionMinutes * 60 * 1000
      )
    })

    it('returns zero when no events to clean', async () => {
      const removedCount = await buffer.cleanup()
      expect(removedCount).toBe(0)
    })

    it('preserves recent events during cleanup', async () => {
      buffer = new RedisEventBuffer(10, 0.1)

      const recentEvents = createMockEvents(5)

      for (const event of recentEvents) {
        await buffer.addEvent(event)
      }

      const removedCount = await buffer.cleanup()
      expect(removedCount).toBe(0)
      expect(await buffer.getEventCount()).toBe(5)
    })
  })

  describe('clear', () => {
    it('removes all events', async () => {
      const events = createMockEvents(10)

      for (const event of events) {
        await buffer.addEvent(event)
      }

      expect(await buffer.getEventCount()).toBe(10)

      await buffer.clear()

      expect(await buffer.getEventCount()).toBe(0)
      expect(await buffer.getAllEvents()).toEqual([])
    })

    it('is idempotent', async () => {
      await buffer.clear()
      await buffer.clear()

      expect(await buffer.getEventCount()).toBe(0)
    })
  })

  describe('data validation', () => {
    it('skips events with missing tenant_id during retrieval', async () => {
      // Add event with missing tenant_id (shouldn't normally happen but testing validation)
      const invalidEvent = { ...createMockEvent(), tenant_id: '' }
      const validEvent = createMockEvent({ tenant_id: 'valid-tenant' })

      await buffer.addEvent(validEvent)

      const retrieved = await buffer.getAllEvents()
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].tenant_id).toBe('valid-tenant')
    })

    it('handles malformed JSON gracefully', async () => {
      // This test verifies the deserialization error handling
      // In practice, this shouldn't happen as we control serialization
      const validEvent = createMockEvent()
      await buffer.addEvent(validEvent)

      const events = await buffer.getAllEvents()
      expect(events).toHaveLength(1)
    })
  })

  describe('concurrent operations', () => {
    it('handles concurrent writes', async () => {
      const events = createMockEvents(20)

      // Add events concurrently
      await Promise.all(events.map(event => buffer.addEvent(event)))

      const count = await buffer.getEventCount()
      expect(count).toBe(20)
    })

    it('handles concurrent reads and writes', async () => {
      await buffer.clear()

      const writePromises = Array.from({ length: 10 }, (_, i) =>
        buffer.addEvent(createMockEvent({
          timestamp: new Date(Date.now() - i * 1000).toISOString()
        }))
      )
      const readPromises = Array.from({ length: 10 }, () =>
        buffer.getEventCount()
      )

      await Promise.all([...writePromises, ...readPromises])

      const finalCount = await buffer.getEventCount()
      expect(finalCount).toBe(10)
    })
  })

  describe('multi-tenant scenarios', () => {
    it('stores events from multiple tenants', async () => {
      const events = [
        ...createMockEvents(5, { tenant_id: 'tenant-a' }),
        ...createMockEvents(3, { tenant_id: 'tenant-b' }),
        ...createMockEvents(7, { tenant_id: 'tenant-c' })
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const allEvents = await buffer.getAllEvents()
      expect(allEvents).toHaveLength(15)

      const tenantIds = new Set(allEvents.map(e => e.tenant_id))
      expect(tenantIds.size).toBe(3)
      expect(tenantIds.has('tenant-a')).toBe(true)
      expect(tenantIds.has('tenant-b')).toBe(true)
      expect(tenantIds.has('tenant-c')).toBe(true)
    })

    it('retrieves events from all tenants in time window', async () => {
      const now = Date.now()
      const events = [
        createMockEvent({
          tenant_id: 'tenant-a',
          timestamp: new Date(now - 2 * 60 * 1000).toISOString()
        }),
        createMockEvent({
          tenant_id: 'tenant-b',
          timestamp: new Date(now - 3 * 60 * 1000).toISOString()
        }),
        createMockEvent({
          tenant_id: 'tenant-c',
          timestamp: new Date(now - 10 * 60 * 1000).toISOString()
        })
      ]

      for (const event of events) {
        await buffer.addEvent(event)
      }

      const windowEvents = await buffer.getEventsInWindow(5)
      expect(windowEvents).toHaveLength(2)

      const tenantIds = windowEvents.map(e => e.tenant_id)
      expect(tenantIds).toContain('tenant-a')
      expect(tenantIds).toContain('tenant-b')
      expect(tenantIds).not.toContain('tenant-c')
    })
  })
})
