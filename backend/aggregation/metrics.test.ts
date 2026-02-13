import { describe, it, expect, beforeEach, vi } from 'vitest'
import { aggregateErrorMetrics, aggregateLatencyMetrics } from './metrics.js'
import * as redisEventBuffer from '../storage/redisEventBuffer.js'
import { createMockEvent, createMockEvents } from '../__tests__/utils/testHelpers.js'

// Mock the eventBuffer module
vi.mock('../storage/redisEventBuffer.js', () => ({
  eventBuffer: {
    getEventsInWindow: vi.fn()
  }
}))

describe('aggregateErrorMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('error rate calculations', () => {
    it('calculates error rate correctly for single tenant', async () => {
      // Mock events: 2 success, 1 error for tenant-1
      const events = [
        ...createMockEvents(2, { tenant_id: 'tenant-1', status_code: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-1', status_code: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result).toHaveLength(1)
      expect(result[0].tenant_id).toBe('tenant-1')
      expect(result[0].total_requests).toBe(3)
      expect(result[0].error_count).toBe(1)
      expect(result[0].error_rate).toBeCloseTo(0.333, 2)
    })

    it('handles multiple tenants with different error rates', async () => {
      const events = [
        // tenant-1: 50% error rate (1/2)
        ...createMockEvents(1, { tenant_id: 'tenant-1', status_code: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-1', status_code: 500 }),
        // tenant-2: 33% error rate (1/3)
        ...createMockEvents(2, { tenant_id: 'tenant-2', status_code: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-2', status_code: 503 }),
        // tenant-3: 0% error rate
        ...createMockEvents(3, { tenant_id: 'tenant-3', status_code: 200 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result).toHaveLength(3)
      // Sorted by error rate descending
      expect(result[0].tenant_id).toBe('tenant-1')
      expect(result[0].error_rate).toBeCloseTo(0.5, 2)
      expect(result[1].tenant_id).toBe('tenant-2')
      expect(result[1].error_rate).toBeCloseTo(0.333, 2)
      expect(result[2].tenant_id).toBe('tenant-3')
      expect(result[2].error_rate).toBe(0)
    })

    it('sorts tenants by error rate descending', async () => {
      const events = [
        // tenant-low: 10% error rate
        ...createMockEvents(9, { tenant_id: 'tenant-low', status_code: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-low', status_code: 500 }),
        // tenant-high: 80% error rate
        ...createMockEvents(2, { tenant_id: 'tenant-high', status_code: 200 }),
        ...createMockEvents(8, { tenant_id: 'tenant-high', status_code: 500 }),
        // tenant-mid: 50% error rate
        ...createMockEvents(5, { tenant_id: 'tenant-mid', status_code: 200 }),
        ...createMockEvents(5, { tenant_id: 'tenant-mid', status_code: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result[0].tenant_id).toBe('tenant-high')
      expect(result[0].error_rate).toBeCloseTo(0.8, 2)
      expect(result[1].tenant_id).toBe('tenant-mid')
      expect(result[1].error_rate).toBe(0.5)
      expect(result[2].tenant_id).toBe('tenant-low')
      expect(result[2].error_rate).toBeCloseTo(0.1, 2)
    })

    it('handles ties by error count', async () => {
      const events = [
        // Both have 50% error rate, but tenant-a has more total errors
        ...createMockEvents(5, { tenant_id: 'tenant-a', status_code: 200 }),
        ...createMockEvents(5, { tenant_id: 'tenant-a', status_code: 500 }),
        ...createMockEvents(1, { tenant_id: 'tenant-b', status_code: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-b', status_code: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result[0].tenant_id).toBe('tenant-a')
      expect(result[0].error_count).toBe(5)
      expect(result[1].tenant_id).toBe('tenant-b')
      expect(result[1].error_count).toBe(1)
    })

    it('handles zero requests gracefully', async () => {
      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue([])

      const result = await aggregateErrorMetrics(5, 10)

      expect(result).toEqual([])
    })

    it('respects the limit parameter', async () => {
      const events = [
        ...createMockEvents(1, { tenant_id: 'tenant-1', status_code: 500 }),
        ...createMockEvents(1, { tenant_id: 'tenant-2', status_code: 500 }),
        ...createMockEvents(1, { tenant_id: 'tenant-3', status_code: 500 }),
        ...createMockEvents(1, { tenant_id: 'tenant-4', status_code: 500 }),
        ...createMockEvents(1, { tenant_id: 'tenant-5', status_code: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 3)

      expect(result).toHaveLength(3)
    })

    it('treats status codes >= 500 as errors', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', status_code: 200 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 201 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 400 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 404 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 500 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 502 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 503 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result[0].total_requests).toBe(7)
      expect(result[0].error_count).toBe(3) // 500, 502, 503
      expect(result[0].error_rate).toBeCloseTo(3 / 7, 2)
    })

    it('skips events with missing tenant_id', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', status_code: 200 }),
        createMockEvent({ tenant_id: '', status_code: 500 }),
        createMockEvent({ tenant_id: 'tenant-1', status_code: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateErrorMetrics(5, 10)

      expect(result).toHaveLength(1)
      expect(result[0].tenant_id).toBe('tenant-1')
      expect(result[0].total_requests).toBe(2)
    })
  })
})

describe('aggregateLatencyMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('P95 calculations', () => {
    it('calculates P95 correctly for 100 samples', async () => {
      // Create 100 events with latencies 1-100ms
      const events = Array.from({ length: 100 }, (_, i) =>
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: i + 1 })
      )

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result).toHaveLength(1)
      expect(result[0].tenant_id).toBe('tenant-1')
      expect(result[0].total_requests).toBe(100)
      expect(result[0].mean_latency).toBe(51) // Mean of 1-100 is 50.5, rounded to 51
      expect(result[0].p95_latency).toBe(95) // 95th percentile of 1-100
    })

    it('handles single data point', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 150 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result).toHaveLength(1)
      expect(result[0].mean_latency).toBe(150)
      expect(result[0].p95_latency).toBe(150)
    })

    it('filters out invalid latencies (NaN, negative)', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 100 }),
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 200 }),
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: NaN }),
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: -50 }),
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 300 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result).toHaveLength(1)
      expect(result[0].total_requests).toBe(5) // All events counted
      // But mean/p95 only from valid latencies: 100, 200, 300
      expect(result[0].mean_latency).toBe(200)
      expect(result[0].p95_latency).toBe(300)
    })

    it('sorts tenants by P95 latency descending', async () => {
      const events = [
        ...createMockEvents(10, { tenant_id: 'tenant-fast', latency_ms: 50 }),
        ...createMockEvents(10, { tenant_id: 'tenant-slow', latency_ms: 500 }),
        ...createMockEvents(10, { tenant_id: 'tenant-mid', latency_ms: 200 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result[0].tenant_id).toBe('tenant-slow')
      expect(result[1].tenant_id).toBe('tenant-mid')
      expect(result[2].tenant_id).toBe('tenant-fast')
    })

    it('handles zero requests gracefully', async () => {
      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue([])

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result).toEqual([])
    })

    it('skips tenants with no valid latencies', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 100 }),
        createMockEvent({ tenant_id: 'tenant-2', latency_ms: NaN }),
        createMockEvent({ tenant_id: 'tenant-2', latency_ms: -1 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      // tenant-2 should be excluded because all latencies are invalid
      expect(result).toHaveLength(1)
      expect(result[0].tenant_id).toBe('tenant-1')
    })

    it('respects the limit parameter', async () => {
      const events = [
        ...createMockEvents(1, { tenant_id: 'tenant-1', latency_ms: 100 }),
        ...createMockEvents(1, { tenant_id: 'tenant-2', latency_ms: 200 }),
        ...createMockEvents(1, { tenant_id: 'tenant-3', latency_ms: 300 }),
        ...createMockEvents(1, { tenant_id: 'tenant-4', latency_ms: 400 }),
        ...createMockEvents(1, { tenant_id: 'tenant-5', latency_ms: 500 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 3)

      expect(result).toHaveLength(3)
      expect(result[0].tenant_id).toBe('tenant-5')
      expect(result[1].tenant_id).toBe('tenant-4')
      expect(result[2].tenant_id).toBe('tenant-3')
    })

    it('calculates mean and P95 correctly for varied latencies', async () => {
      // Create events with specific latency distribution
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      const events = latencies.map(lat =>
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: lat })
      )

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result[0].mean_latency).toBe(55) // (10+20+...+100)/10 = 55
      expect(result[0].p95_latency).toBe(100) // 95th percentile of 10 items
    })

    it('rounds mean and P95 to nearest millisecond', async () => {
      const events = [
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 100.7 }),
        createMockEvent({ tenant_id: 'tenant-1', latency_ms: 200.3 })
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      // Mean = (100.7 + 200.3) / 2 = 150.5, rounded to 151
      expect(result[0].mean_latency).toBe(151)
      // P95 = 200.3, rounded to 200
      expect(result[0].p95_latency).toBe(200)
    })

    it('handles multiple tenants with different latency profiles', async () => {
      const events = [
        // tenant-1: consistent low latency
        ...Array.from({ length: 10 }, () =>
          createMockEvent({ tenant_id: 'tenant-1', latency_ms: 50 })
        ),
        // tenant-2: high variance
        ...Array.from({ length: 5 }, () =>
          createMockEvent({ tenant_id: 'tenant-2', latency_ms: 10 })
        ),
        ...Array.from({ length: 5 }, () =>
          createMockEvent({ tenant_id: 'tenant-2', latency_ms: 1000 })
        )
      ]

      vi.mocked(redisEventBuffer.eventBuffer.getEventsInWindow).mockResolvedValue(events)

      const result = await aggregateLatencyMetrics(5, 10)

      expect(result).toHaveLength(2)
      expect(result[0].tenant_id).toBe('tenant-2') // Higher P95
      expect(result[0].p95_latency).toBe(1000)
      expect(result[1].tenant_id).toBe('tenant-1')
      expect(result[1].p95_latency).toBe(50)
    })
  })
})
