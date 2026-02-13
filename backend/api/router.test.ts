import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import apiRouter from './router.js'
import * as metrics from '../aggregation/metrics.js'

// Mock the aggregation functions
vi.mock('../aggregation/metrics.js', () => ({
  aggregateErrorMetrics: vi.fn(),
  aggregateLatencyMetrics: vi.fn()
}))

describe('Analytics API Router', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(apiRouter)
  })

  describe('GET /api/v1/analytics/top-tenants/errors', () => {
    describe('successful requests', () => {
      it('returns error metrics with default params', async () => {
        const mockData = [
          { tenant_id: 'tenant-1', total_requests: 100, error_count: 10, error_rate: 0.1 },
          { tenant_id: 'tenant-2', total_requests: 50, error_count: 5, error_rate: 0.1 }
        ]

        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          window_minutes: 5,
          tenants: mockData
        })
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('respects custom window parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=15')

        expect(response.status).toBe(200)
        expect(response.body.window_minutes).toBe(15)
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(15, 10)
      })

      it('respects custom limit parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors?limit=25')

        expect(response.status).toBe(200)
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(5, 25)
      })

      it('respects both window and limit parameters', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=30&limit=50')

        expect(response.status).toBe(200)
        expect(response.body.window_minutes).toBe(30)
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(30, 50)
      })

      it('returns empty array when no data available', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          window_minutes: 5,
          tenants: []
        })
      })

      it('returns multiple tenant metrics sorted by error rate', async () => {
        const mockData = [
          { tenant_id: 'high-errors', total_requests: 100, error_count: 50, error_rate: 0.5 },
          { tenant_id: 'medium-errors', total_requests: 100, error_count: 25, error_rate: 0.25 },
          { tenant_id: 'low-errors', total_requests: 100, error_count: 5, error_rate: 0.05 }
        ]

        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors')

        expect(response.status).toBe(200)
        expect(response.body.tenants).toEqual(mockData)
        expect(response.body.tenants[0].error_rate).toBeGreaterThan(
          response.body.tenants[1].error_rate
        )
      })
    })

    describe('parameter parsing', () => {
      it('handles string window parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=20')

        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(20, 10)
      })

      it('handles invalid window parameter (non-numeric)', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=invalid')

        // NaN from parseInt will be falsy, so default should be used
        expect(response.status).toBe(200)
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('handles invalid limit parameter (non-numeric)', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors?limit=invalid')

        expect(response.status).toBe(200)
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('handles negative window parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=-5')

        // Negative values will be parsed as-is
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(-5, 10)
      })

      it('handles zero window parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=0')

        // 0 is falsy, so default should be used
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('handles decimal window parameter', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

        await request(app)
          .get('/api/v1/analytics/top-tenants/errors?window=7.5')

        // parseInt will truncate to 7
        expect(metrics.aggregateErrorMetrics).toHaveBeenCalledWith(7, 10)
      })
    })

    describe('error handling', () => {
      it('returns 500 when aggregation fails', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockRejectedValue(
          new Error('Database error')
        )

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors')

        expect(response.status).toBe(500)
        expect(response.body).toEqual({ error: 'Failed to aggregate error metrics' })
      })

      it('handles timeout errors gracefully', async () => {
        vi.mocked(metrics.aggregateErrorMetrics).mockRejectedValue(
          new Error('Timeout')
        )

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/errors')

        expect(response.status).toBe(500)
        expect(response.body.error).toBe('Failed to aggregate error metrics')
      })
    })
  })

  describe('GET /api/v1/analytics/top-tenants/latency', () => {
    describe('successful requests', () => {
      it('returns latency metrics with default params', async () => {
        const mockData = [
          { tenant_id: 'tenant-1', total_requests: 100, mean_latency: 150, p95_latency: 250 },
          { tenant_id: 'tenant-2', total_requests: 50, mean_latency: 100, p95_latency: 200 }
        ]

        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          window_minutes: 5,
          tenants: mockData
        })
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('respects custom window parameter', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency?window=20')

        expect(response.status).toBe(200)
        expect(response.body.window_minutes).toBe(20)
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(20, 10)
      })

      it('respects custom limit parameter', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency?limit=15')

        expect(response.status).toBe(200)
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(5, 15)
      })

      it('respects both window and limit parameters', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency?window=10&limit=20')

        expect(response.status).toBe(200)
        expect(response.body.window_minutes).toBe(10)
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(10, 20)
      })

      it('returns empty array when no data available', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
          window_minutes: 5,
          tenants: []
        })
      })

      it('returns multiple tenant metrics sorted by P95 latency', async () => {
        const mockData = [
          { tenant_id: 'slow', total_requests: 100, mean_latency: 500, p95_latency: 1000 },
          { tenant_id: 'medium', total_requests: 100, mean_latency: 200, p95_latency: 400 },
          { tenant_id: 'fast', total_requests: 100, mean_latency: 50, p95_latency: 100 }
        ]

        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue(mockData)

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency')

        expect(response.status).toBe(200)
        expect(response.body.tenants).toEqual(mockData)
        expect(response.body.tenants[0].p95_latency).toBeGreaterThan(
          response.body.tenants[1].p95_latency
        )
      })
    })

    describe('parameter parsing', () => {
      it('handles invalid window parameter', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency?window=abc')

        expect(response.status).toBe(200)
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('handles invalid limit parameter', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency?limit=xyz')

        expect(response.status).toBe(200)
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(5, 10)
      })

      it('handles zero limit parameter', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

        await request(app)
          .get('/api/v1/analytics/top-tenants/latency?limit=0')

        // 0 is falsy, so default should be used
        expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledWith(5, 10)
      })
    })

    describe('error handling', () => {
      it('returns 500 when aggregation fails', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockRejectedValue(
          new Error('Storage error')
        )

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency')

        expect(response.status).toBe(500)
        expect(response.body).toEqual({ error: 'Failed to aggregate latency metrics' })
      })

      it('handles connection errors gracefully', async () => {
        vi.mocked(metrics.aggregateLatencyMetrics).mockRejectedValue(
          new Error('Connection refused')
        )

        const response = await request(app)
          .get('/api/v1/analytics/top-tenants/latency')

        expect(response.status).toBe(500)
        expect(response.body.error).toBe('Failed to aggregate latency metrics')
      })
    })
  })

  describe('concurrent requests', () => {
    it('handles multiple concurrent analytics requests', async () => {
      vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])
      vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

      const errorRequests = Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/analytics/top-tenants/errors')
      )

      const latencyRequests = Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/analytics/top-tenants/latency')
      )

      const responses = await Promise.all([...errorRequests, ...latencyRequests])

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      expect(metrics.aggregateErrorMetrics).toHaveBeenCalledTimes(5)
      expect(metrics.aggregateLatencyMetrics).toHaveBeenCalledTimes(5)
    })
  })

  describe('HTTP method restrictions', () => {
    it('rejects POST to errors endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/top-tenants/errors')

      expect(response.status).toBe(404)
    })

    it('rejects POST to latency endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/top-tenants/latency')

      expect(response.status).toBe(404)
    })

    it('accepts GET to errors endpoint', async () => {
      vi.mocked(metrics.aggregateErrorMetrics).mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/errors')

      expect(response.status).toBe(200)
    })

    it('accepts GET to latency endpoint', async () => {
      vi.mocked(metrics.aggregateLatencyMetrics).mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/latency')

      expect(response.status).toBe(200)
    })
  })
})
