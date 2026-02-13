import type { StoredEvent } from '../../storage/redisEventBuffer.js'

/**
 * Helper to create mock events for testing
 */
export function createMockEvent(overrides?: Partial<StoredEvent>): StoredEvent {
  return {
    timestamp: new Date().toISOString(),
    tenant_id: 'test-tenant',
    endpoint: '/api/test',
    method: 'GET',
    status_code: 200,
    latency_ms: 100,
    service: 'test-service',
    ...overrides
  }
}

/**
 * Helper to create multiple mock events
 */
export function createMockEvents(count: number, overrides?: Partial<StoredEvent>): StoredEvent[] {
  return Array.from({ length: count }, (_, i) => createMockEvent({
    ...overrides,
    timestamp: new Date(Date.now() - i * 1000).toISOString()
  }))
}
