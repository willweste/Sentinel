import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { tenantMiddleware, observabilityMiddleware } from '@sentinel/observability'

/**
 * SDK Integration Tests
 *
 * These tests verify that the SDK middleware integrates correctly
 * with Express applications (smoke tests for the demo app)
 */
describe('SDK Integration', () => {
  let app: express.Application
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock fetch to avoid actual HTTP calls
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    global.fetch = mockFetch

    // Create a fresh app for each test
    app = express()
    app.use(express.json())
  })

  describe('Middleware Integration', () => {
    it('instruments Express app with tenant and observability middleware', async () => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://test-backend/events',
          serviceName: 'integration-test'
        })
      )

      app.get('/test', (req, res) => {
        res.json({ tenant_id: req.tenantId })
      })

      const response = await request(app)
        .get('/test')
        .set('x-tenant-id', 'test-tenant')

      expect(response.status).toBe(200)
      expect(response.body.tenant_id).toBe('test-tenant')

      // Wait for observability event to be sent
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-backend/events',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('allows tenant extraction from headers', async () => {
      app.use(tenantMiddleware())

      app.get('/tenant-info', (req, res) => {
        res.json({ tenant_id: req.tenantId })
      })

      const response = await request(app)
        .get('/tenant-info')
        .set('x-api-key', 'tenant-123')

      expect(response.status).toBe(200)
      expect(response.body.tenant_id).toBe('tenant-123')
    })

    it('works without tenant ID (uses "unknown")', async () => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://test-backend/events'
        })
      )

      app.get('/no-tenant', (req, res) => {
        res.json({ success: true })
      })

      const response = await request(app)
        .get('/no-tenant')

      expect(response.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.tenant_id).toBe('unknown')
    })

    it('can be disabled to skip instrumentation', async () => {
      app.use(
        observabilityMiddleware({
          enabled: false
        })
      )

      app.get('/disabled', (req, res) => {
        res.json({ success: true })
      })

      await request(app).get('/disabled')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Test App Routes', () => {
    beforeEach(() => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events',
          serviceName: 'test-app'
        })
      )
    })

    it('GET / returns status and tenant_id', async () => {
      app.get('/', (req, res) => {
        res.json({ status: 'ok', tenant_id: req.tenantId })
      })

      const response = await request(app)
        .get('/')
        .set('x-tenant-id', 'acme')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        status: 'ok',
        tenant_id: 'acme'
      })
    })

    it('GET /api/v1/users returns user list', async () => {
      app.get('/api/v1/users', (req, res) => {
        res.json({
          users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
          tenant_id: req.tenantId
        })
      })

      const response = await request(app)
        .get('/api/v1/users')
        .set('x-tenant-id', 'corp')

      expect(response.status).toBe(200)
      expect(response.body.users).toHaveLength(2)
      expect(response.body.tenant_id).toBe('corp')
    })

    it('POST /api/v1/process handles POST requests', async () => {
      app.post('/api/v1/process', (req, res) => {
        res.json({
          result: 'processed',
          tenant_id: req.tenantId,
          timestamp: new Date().toISOString()
        })
      })

      const response = await request(app)
        .post('/api/v1/process')
        .set('x-tenant-id', 'test')
        .send({ data: 'sample' })

      expect(response.status).toBe(200)
      expect(response.body.result).toBe('processed')
      expect(response.body.tenant_id).toBe('test')
    })

    it('GET /api/v1/error returns 500 for error testing', async () => {
      app.get('/api/v1/error', (req, res) => {
        res.status(500).json({
          error: 'Internal server error',
          tenant_id: req.tenantId
        })
      })

      const response = await request(app)
        .get('/api/v1/error')
        .set('x-tenant-id', 'error-tenant')

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Internal server error')

      // Wait for observability event
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should still send event even for errors
      expect(mockFetch).toHaveBeenCalled()

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.status_code).toBe(500)
      expect(body.tenant_id).toBe('error-tenant')
    })
  })

  describe('Observability Event Capture', () => {
    beforeEach(() => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events',
          serviceName: 'test-app'
        })
      )

      app.get('/monitored', (req, res) => {
        res.json({ success: true })
      })
    })

    it('captures request method', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.method).toBe('GET')
    })

    it('captures request path', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.endpoint).toBe('/monitored')
    })

    it('captures response status code', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.status_code).toBe(200)
    })

    it('captures latency', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.latency_ms).toBeGreaterThanOrEqual(0)
      expect(typeof body.latency_ms).toBe('number')
    })

    it('captures service name', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.service).toBe('test-app')
    })

    it('includes timestamp in ISO format', async () => {
      await request(app).get('/monitored')

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('Multi-tenant scenarios', () => {
    beforeEach(() => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events',
          serviceName: 'multi-tenant-app'
        })
      )

      app.get('/resource', (req, res) => {
        res.json({ data: 'resource', tenant_id: req.tenantId })
      })
    })

    it('isolates requests from different tenants', async () => {
      const tenant1Response = await request(app)
        .get('/resource')
        .set('x-tenant-id', 'tenant-1')

      const tenant2Response = await request(app)
        .get('/resource')
        .set('x-tenant-id', 'tenant-2')

      expect(tenant1Response.body.tenant_id).toBe('tenant-1')
      expect(tenant2Response.body.tenant_id).toBe('tenant-2')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledTimes(2)

      const call1Body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const call2Body = JSON.parse(mockFetch.mock.calls[1][1].body)

      expect(call1Body.tenant_id).toBe('tenant-1')
      expect(call2Body.tenant_id).toBe('tenant-2')
    })

    it('handles concurrent requests from multiple tenants', async () => {
      const promises = [
        request(app).get('/resource').set('x-tenant-id', 'concurrent-1'),
        request(app).get('/resource').set('x-tenant-id', 'concurrent-2'),
        request(app).get('/resource').set('x-tenant-id', 'concurrent-3')
      ]

      const responses = await Promise.all(promises)

      expect(responses).toHaveLength(3)
      expect(responses.every(r => r.status === 200)).toBe(true)
    })
  })

  describe('Internal endpoint filtering', () => {
    it('skips observability for /api/v1/events endpoint', async () => {
      app.use(tenantMiddleware())
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events'
        })
      )

      app.post('/api/v1/events', (req, res) => {
        res.status(201).json({ status: 'received' })
      })

      await request(app)
        .post('/api/v1/events')
        .send({ test: 'data' })

      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not send observability event for internal endpoint
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips observability for /api/v1/analytics endpoints', async () => {
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events'
        })
      )

      app.get('/api/v1/analytics/metrics', (req, res) => {
        res.json({ metrics: [] })
      })

      await request(app).get('/api/v1/analytics/metrics')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('tracks other API endpoints normally', async () => {
      app.use(
        observabilityMiddleware({
          ingestionUrl: 'http://localhost:3000/api/v1/events'
        })
      )

      app.get('/api/v2/data', (req, res) => {
        res.json({ data: 'test' })
      })

      await request(app).get('/api/v2/data')

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledOnce()
    })
  })
})
