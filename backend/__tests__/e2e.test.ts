import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import ingestionRouter from '../ingestion/router.js'
import apiRouter from '../api/router.js'
import debugRouter from '../debug/router.js'
import { clearTestRedis } from './utils/redisMock.js'

/**
 * End-to-End Integration Tests
 *
 * These tests verify the full data flow:
 * 1. Ingest events via POST /api/v1/events
 * 2. Retrieve analytics via GET /api/v1/analytics/*
 * 3. Verify debug endpoints work
 *
 * REQUIREMENTS:
 * - Redis must be running (docker-compose up -d redis)
 */
describe('End-to-End Flow', () => {
  let app: express.Application

  beforeAll(async () => {
    // Set up Express app with all routers
    app = express()
    app.use(express.json())
    app.use(ingestionRouter)
    app.use(apiRouter)
    app.use(debugRouter)
  })

  beforeEach(async () => {
    // Clear Redis before each test
    await clearTestRedis()
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  afterAll(async () => {
    await clearTestRedis()
  })

  describe('Ingestion → Analytics Flow', () => {
    it('ingests event and retrieves in error analytics', async () => {
      // 1. Ingest error event
      const ingestResponse = await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'e2e-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 500,
          latency_ms: 100,
          service: 'e2e-service'
        })

      expect(ingestResponse.status).toBe(201)

      // 2. Query error analytics
      const analyticsResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(analyticsResponse.status).toBe(200)
      expect(analyticsResponse.body.tenants).toHaveLength(1)
      expect(analyticsResponse.body.tenants[0]).toMatchObject({
        tenant_id: 'e2e-tenant',
        total_requests: 1,
        error_count: 1,
        error_rate: 1
      })
    })

    it('ingests event and retrieves in latency analytics', async () => {
      // 1. Ingest event with latency
      const ingestResponse = await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'latency-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/slow',
          method: 'GET',
          status_code: 200,
          latency_ms: 500,
          service: 'slow-service'
        })

      expect(ingestResponse.status).toBe(201)

      // 2. Query latency analytics
      const analyticsResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/latency?window=5')

      expect(analyticsResponse.status).toBe(200)
      expect(analyticsResponse.body.tenants).toHaveLength(1)
      expect(analyticsResponse.body.tenants[0]).toMatchObject({
        tenant_id: 'latency-tenant',
        total_requests: 1,
        mean_latency: 500,
        p95_latency: 500
      })
    })

    it('handles multiple tenants with different error rates', async () => {
      // Use unique tenant IDs to avoid interference from other tests
      const uniqueId = Date.now()

      // Ingest events for multiple tenants
      const events = [
        // tenant-high: 100% error rate (simpler test)
        ...Array.from({ length: 3 }, () => ({
          tenant_id: `tenant-high-${uniqueId}`,
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 500,
          latency_ms: 100
        })),
        // tenant-low: 0% error rate
        ...Array.from({ length: 3 }, () => ({
          tenant_id: `tenant-low-${uniqueId}`,
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
          latency_ms: 100
        }))
      ]

      // Ingest all events sequentially
      for (const event of events) {
        await request(app).post('/api/v1/events').send(event)
      }

      // Wait for Redis to persist all events
      await new Promise(resolve => setTimeout(resolve, 150))

      // Query analytics
      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(response.status).toBe(200)

      // Find our tenants in the results
      const highTenant = response.body.tenants.find((t: any) => t.tenant_id === `tenant-high-${uniqueId}`)
      const lowTenant = response.body.tenants.find((t: any) => t.tenant_id === `tenant-low-${uniqueId}`)

      expect(highTenant).toBeDefined()
      expect(lowTenant).toBeDefined()
      // High tenant should have 100% error rate
      expect(highTenant.error_rate).toBe(1)
      // Low tenant should have 0% error rate
      expect(lowTenant.error_rate).toBe(0)
    })

    it('handles multiple tenants with different latencies', async () => {
      const events = [
        // tenant-slow: 500ms avg
        ...Array.from({ length: 5 }, () => ({
          tenant_id: 'tenant-slow',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
          latency_ms: 500
        })),
        // tenant-fast: 50ms avg
        ...Array.from({ length: 5 }, () => ({
          tenant_id: 'tenant-fast',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
          latency_ms: 50
        }))
      ]

      for (const event of events) {
        await request(app).post('/api/v1/events').send(event)
      }

      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/latency?window=5')

      expect(response.status).toBe(200)
      expect(response.body.tenants).toHaveLength(2)

      // Should be sorted by P95 descending
      expect(response.body.tenants[0].tenant_id).toBe('tenant-slow')
      expect(response.body.tenants[0].p95_latency).toBe(500)
      expect(response.body.tenants[1].tenant_id).toBe('tenant-fast')
      expect(response.body.tenants[1].p95_latency).toBe(50)
    })

    it('respects window parameter for time-based filtering', async () => {
      const now = Date.now()

      // Event from 10 minutes ago
      await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'old-tenant',
          timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 500,
          latency_ms: 100
        })

      // Event from now
      await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'recent-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 500,
          latency_ms: 100
        })

      // Query with 5-minute window (should only get recent event)
      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(response.status).toBe(200)
      expect(response.body.tenants).toHaveLength(1)
      expect(response.body.tenants[0].tenant_id).toBe('recent-tenant')
    })

    it('respects limit parameter for result count', async () => {
      // Create 10 tenants
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: `tenant-${i}`,
            timestamp: new Date().toISOString(),
            endpoint: '/api/test',
            method: 'GET',
            status_code: 500,
            latency_ms: 100
          })
      }

      // Query with limit=3
      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?limit=3')

      expect(response.status).toBe(200)
      expect(response.body.tenants).toHaveLength(3)
    })
  })

  describe('Debug Endpoints', () => {
    it('retrieves events via debug endpoint', async () => {
      // Ingest event
      await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'debug-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/debug',
          method: 'GET',
          status_code: 200,
          latency_ms: 50
        })

      // Query debug endpoint
      const response = await request(app)
        .get('/api/v1/debug/events?window=5')

      expect(response.status).toBe(200)
      expect(response.body.events).toHaveLength(1)
      expect(response.body.events[0]).toMatchObject({
        tenant_id: 'debug-tenant',
        endpoint: '/api/debug',
        method: 'GET',
        status_code: 200,
        latency_ms: 50
      })
    })

    it('retrieves stats via debug endpoint', async () => {
      // Ingest multiple events
      await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'stats-tenant-1',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
          latency_ms: 100
        })

      await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'stats-tenant-2',
          timestamp: new Date().toISOString(),
          endpoint: '/api/test',
          method: 'GET',
          status_code: 200,
          latency_ms: 100
        })

      // Query stats endpoint
      const response = await request(app)
        .get('/api/v1/debug/stats')

      expect(response.status).toBe(200)
      expect(response.body.total_events).toBe(2)
      expect(response.body.events_last_5min).toBe(2)
      expect(response.body.unique_tenants_last_5min).toBe(2)
      expect(response.body.tenant_distribution).toEqual({
        'stats-tenant-1': 1,
        'stats-tenant-2': 1
      })
    })
  })

  describe('Real-world scenarios', () => {
    it('handles mixed success and error events correctly', async () => {
      const events = [
        { tenant_id: 'mixed-tenant', status_code: 200 },
        { tenant_id: 'mixed-tenant', status_code: 200 },
        { tenant_id: 'mixed-tenant', status_code: 500 },
        { tenant_id: 'mixed-tenant', status_code: 200 },
        { tenant_id: 'mixed-tenant', status_code: 503 }
      ]

      for (const { tenant_id, status_code } of events) {
        await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id,
            timestamp: new Date().toISOString(),
            endpoint: '/api/test',
            method: 'GET',
            status_code,
            latency_ms: 100
          })
      }

      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(response.status).toBe(200)
      expect(response.body.tenants[0]).toMatchObject({
        tenant_id: 'mixed-tenant',
        total_requests: 5,
        error_count: 2, // 500 and 503
        error_rate: 0.4
      })
    })

    it('handles variable latency correctly', async () => {
      const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]

      for (const latency_ms of latencies) {
        await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'variable-latency',
            timestamp: new Date().toISOString(),
            endpoint: '/api/test',
            method: 'GET',
            status_code: 200,
            latency_ms
          })
      }

      const response = await request(app)
        .get('/api/v1/analytics/top-tenants/latency?window=5')

      expect(response.status).toBe(200)
      expect(response.body.tenants[0]).toMatchObject({
        tenant_id: 'variable-latency',
        total_requests: 10
      })

      // Mean of 50-500 is 275
      expect(response.body.tenants[0].mean_latency).toBeCloseTo(275, 0)
      // P95 of 10 samples should be around the 9th or 10th value
      expect(response.body.tenants[0].p95_latency).toBeGreaterThanOrEqual(450)
    })

    it('handles high throughput ingestion', async () => {
      const uniqueId = Date.now()

      // Ingest 20 events (smaller test for reliability)
      const promises = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: `throughput-${uniqueId}-${i % 3}`, // 3 different tenants
            timestamp: new Date().toISOString(),
            endpoint: '/api/test',
            method: 'GET',
            status_code: 200,
            latency_ms: 100
          })
      )

      const responses = await Promise.all(promises)

      // All HTTP requests should succeed (201)
      expect(responses.every(r => r.status === 201)).toBe(true)
      expect(responses).toHaveLength(20)
    })

    it('returns empty results when no data in window', async () => {
      const errorResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(errorResponse.status).toBe(200)
      expect(errorResponse.body.tenants).toEqual([])

      const latencyResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/latency?window=5')

      expect(latencyResponse.status).toBe(200)
      expect(latencyResponse.body.tenants).toEqual([])
    })
  })

  describe('Full stack integration', () => {
    it('completes full workflow: ingest → debug → analytics', async () => {
      // Step 1: Ingest event
      const ingestResponse = await request(app)
        .post('/api/v1/events')
        .send({
          tenant_id: 'full-stack-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/full',
          method: 'POST',
          status_code: 201,
          latency_ms: 125,
          service: 'full-service'
        })

      expect(ingestResponse.status).toBe(201)

      // Step 2: Verify via debug endpoint
      const debugResponse = await request(app)
        .get('/api/v1/debug/events?window=5')

      expect(debugResponse.status).toBe(200)
      expect(debugResponse.body.events).toHaveLength(1)
      expect(debugResponse.body.events[0].tenant_id).toBe('full-stack-tenant')

      // Step 3: Verify via analytics endpoints
      const latencyResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/latency?window=5')

      expect(latencyResponse.status).toBe(200)
      expect(latencyResponse.body.tenants[0].tenant_id).toBe('full-stack-tenant')

      const errorResponse = await request(app)
        .get('/api/v1/analytics/top-tenants/errors?window=5')

      expect(errorResponse.status).toBe(200)
      expect(errorResponse.body.tenants[0].tenant_id).toBe('full-stack-tenant')
    })
  })
})
