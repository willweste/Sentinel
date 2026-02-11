/**
 * Type definitions for tenant aggregation results
 */

export interface TenantErrorMetrics {
  tenant_id: string
  total_requests: number
  error_count: number
  error_rate: number
}

export interface TenantLatencyMetrics {
  tenant_id: string
  total_requests: number
  mean_latency: number
  p95_latency: number
}
