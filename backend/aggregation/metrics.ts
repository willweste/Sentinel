/**
 * Aggregation engine for computing tenant-level error and latency metrics
 */

import { eventBuffer, type StoredEvent } from '../storage/redisEventBuffer.js'
import { TenantErrorMetrics, TenantLatencyMetrics } from './types.js'

/**
 * Group events by tenant_id
 */
function groupEventsByTenant(events: StoredEvent[]): Map<string, StoredEvent[]> {
  const grouped = new Map<string, StoredEvent[]>()

  for (const event of events) {
    // Skip events with missing tenant_id
    if (!event.tenant_id) {
      continue
    }

    if (!grouped.has(event.tenant_id)) {
      grouped.set(event.tenant_id, [])
    }
    grouped.get(event.tenant_id)!.push(event)
  }

  return grouped
}

/**
 * Calculate mean (average) of numbers
 */
function calculateMean(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0
  }
  const sum = numbers.reduce((acc, val) => acc + val, 0)
  return sum / numbers.length
}

/**
 * Calculate 95th percentile from sorted latencies
 */
function calculateP95(sortedLatencies: number[]): number {
  if (sortedLatencies.length === 0) {
    return 0
  }

  if (sortedLatencies.length === 1) {
    return sortedLatencies[0]
  }

  const index = Math.ceil(sortedLatencies.length * 0.95) - 1
  return sortedLatencies[index]
}

/**
 * Aggregate error metrics by tenant
 * Returns tenants ranked by error rate (highest first)
 */
export async function aggregateErrorMetrics(
  windowMinutes: number,
  limit: number
): Promise<TenantErrorMetrics[]> {
  const events = await eventBuffer.getEventsInWindow(windowMinutes)

  // No events in window
  if (events.length === 0) {
    return []
  }

  const groupedEvents = groupEventsByTenant(events)
  const metrics: TenantErrorMetrics[] = []

  for (const [tenantId, tenantEvents] of groupedEvents.entries()) {
    const totalRequests = tenantEvents.length
    const errorCount = tenantEvents.filter((e) => e.status_code >= 500).length

    // Avoid division by zero
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0

    metrics.push({
      tenant_id: tenantId,
      total_requests: totalRequests,
      error_count: errorCount,
      error_rate: errorRate,
    })
  }

  // Sort by error_rate descending, then by error_count descending for ties
  metrics.sort((a, b) => {
    if (b.error_rate !== a.error_rate) {
      return b.error_rate - a.error_rate
    }
    return b.error_count - a.error_count
  })

  // Return top N tenants
  return metrics.slice(0, limit)
}

/**
 * Aggregate latency metrics by tenant
 * Returns tenants ranked by P95 latency (highest first)
 */
export async function aggregateLatencyMetrics(
  windowMinutes: number,
  limit: number
): Promise<TenantLatencyMetrics[]> {
  const events = await eventBuffer.getEventsInWindow(windowMinutes)

  // No events in window
  if (events.length === 0) {
    return []
  }

  const groupedEvents = groupEventsByTenant(events)
  const metrics: TenantLatencyMetrics[] = []

  for (const [tenantId, tenantEvents] of groupedEvents.entries()) {
    // Extract latencies, filtering out invalid values
    const latencies = tenantEvents
      .map((e) => e.latency_ms)
      .filter((lat) => typeof lat === 'number' && !isNaN(lat) && lat >= 0)

    if (latencies.length === 0) {
      continue
    }

    // Sort latencies for percentile calculation
    const sortedLatencies = latencies.sort((a, b) => a - b)

    const meanLatency = calculateMean(latencies)
    const p95Latency = calculateP95(sortedLatencies)

    metrics.push({
      tenant_id: tenantId,
      total_requests: tenantEvents.length,
      mean_latency: Math.round(meanLatency), // Round to nearest ms
      p95_latency: Math.round(p95Latency), // Round to nearest ms
    })
  }

  // Sort by p95_latency descending
  metrics.sort((a, b) => b.p95_latency - a.p95_latency)

  // Return top N tenants
  return metrics.slice(0, limit)
}
