import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { observabilityMiddleware, type ObservabilityConfig } from './observability.js'
import type { Request, Response, NextFunction } from 'express'

describe('observabilityMiddleware', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock global fetch
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('basic functionality', () => {
    it('captures request timing and sends event', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201
      })

      const req = {
        path: '/api/users',
        method: 'GET',
        tenantId: 'test-tenant'
      } as unknown as Request

      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            // Simulate response finishing
            setTimeout(callback, 0)
          }
        })
      } as unknown as Response

      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware({
        ingestionUrl: 'http://localhost:3000/api/v1/events',
        serviceName: 'test-service'
      })

      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()

      // Wait for async event sending
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/events')
      expect(options.method).toBe('POST')

      const body = JSON.parse(options.body)
      expect(body).toMatchObject({
        tenant_id: 'test-tenant',
        endpoint: '/api/users',
        method: 'GET',
        status_code: 200,
        service: 'test-service'
      })
      expect(body.timestamp).toBeDefined()
      expect(body.latency_ms).toBeGreaterThanOrEqual(0)
    })

    it('calls next immediately without blocking', () => {
      const req = { path: '/api/test', method: 'GET' } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
    })

    it('attaches finish event listener to response', () => {
      const req = { path: '/api/test', method: 'GET' } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function))
    })
  })

  describe('endpoint filtering', () => {
    it('skips internal endpoints - /api/v1/events', () => {
      const req = {
        path: '/api/v1/events',
        method: 'POST'
      } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(res.on).not.toHaveBeenCalled()
    })

    it('skips internal endpoints - /api/v1/analytics', () => {
      const req = {
        path: '/api/v1/analytics/top-tenants/errors',
        method: 'GET'
      } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(res.on).not.toHaveBeenCalled()
    })

    it('tracks non-internal endpoints', () => {
      const req = {
        path: '/api/users',
        method: 'GET'
      } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function))
    })

    it('tracks endpoints with similar but different paths', () => {
      const paths = [
        '/api/v1/event',  // Similar to /api/v1/events but should be tracked
        '/api/v1/analytic', // Similar to /api/v1/analytics but should be tracked
        '/api/v2/events', // Different version
        '/events' // Different path
      ]

      paths.forEach(path => {
        const req = { path, method: 'GET' } as Request
        const res = { on: vi.fn() } as unknown as Response
        const next = vi.fn() as NextFunction

        const middleware = observabilityMiddleware()
        middleware(req, res, next)

        expect(res.on).toHaveBeenCalled()
      })
    })
  })

  describe('configuration', () => {
    it('uses default ingestion URL when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/events',
        expect.any(Object)
      )
    })

    it('uses custom ingestion URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware({
        ingestionUrl: 'https://custom.example.com/ingest'
      })
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.example.com/ingest',
        expect.any(Object)
      )
    })

    it('includes API key in Authorization header when provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware({
        apiKey: 'secret-key-123'
      })
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers.Authorization).toBe('Bearer secret-key-123')
    })

    it('does not include Authorization header when API key not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers.Authorization).toBeUndefined()
    })

    it('uses custom service name', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware({
        serviceName: 'my-custom-service'
      })
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.service).toBe('my-custom-service')
    })

    it('uses default service name when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.service).toBe('unknown-service')
    })

    it('can be disabled via config', () => {
      const req = { path: '/test', method: 'GET' } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware({ enabled: false })
      middleware(req, res, next)

      expect(next).toHaveBeenCalledOnce()
      expect(res.on).not.toHaveBeenCalled()
    })

    it('is enabled by default', () => {
      const req = { path: '/test', method: 'GET' } as Request
      const res = { on: vi.fn() } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      expect(res.on).toHaveBeenCalled()
    })
  })

  describe('event data', () => {
    it('uses "unknown" tenant when tenantId not set', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = {
        path: '/test',
        method: 'GET'
        // No tenantId
      } as Request

      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.tenant_id).toBe('unknown')
    })

    it('captures different HTTP methods', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

      for (const method of methods) {
        const req = { path: '/test', method } as Request
        const res = {
          statusCode: 200,
          on: vi.fn((event, callback) => {
            if (event === 'finish') setTimeout(callback, 0)
          })
        } as unknown as Response
        const next = vi.fn() as NextFunction

        const middleware = observabilityMiddleware()
        middleware(req, res, next)

        await new Promise(resolve => setTimeout(resolve, 50))

        const [, options] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
        const body = JSON.parse(options.body)
        expect(body.method).toBe(method)
      }
    })

    it('captures different status codes', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const statusCodes = [200, 201, 400, 404, 500, 503]

      for (const statusCode of statusCodes) {
        const req = { path: '/test', method: 'GET' } as Request
        const res = {
          statusCode,
          on: vi.fn((event, callback) => {
            if (event === 'finish') setTimeout(callback, 0)
          })
        } as unknown as Response
        const next = vi.fn() as NextFunction

        const middleware = observabilityMiddleware()
        middleware(req, res, next)

        await new Promise(resolve => setTimeout(resolve, 50))

        const [, options] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
        const body = JSON.parse(options.body)
        expect(body.status_code).toBe(statusCode)
      }
    })

    it('measures latency accurately', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request

      let finishCallback: Function | undefined
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            finishCallback = callback
          }
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      // Simulate 100ms delay before response finishes
      await new Promise(resolve => setTimeout(resolve, 100))
      finishCallback?.()

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.latency_ms).toBeGreaterThanOrEqual(100)
      expect(body.latency_ms).toBeLessThan(200) // Should be close to 100ms
    })

    it('includes timestamp in ISO format', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('captures full request path', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = {
        path: '/api/users/123/posts/456',
        method: 'GET'
      } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.endpoint).toBe('/api/users/123/posts/456')
    })
  })

  describe('error handling', () => {
    it('handles fetch failures gracefully without throwing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetch.mockRejectedValue(new Error('Network error'))

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()

      // Should not throw
      expect(() => middleware(req, res, next)).not.toThrow()

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send event to ingestion API:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('handles non-200 responses from ingestion API', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('does not block request flow when ingestion fails', async () => {
      mockFetch.mockRejectedValue(new Error('Failed'))

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      // Should call next immediately regardless of fetch failure
      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('fetch request format', () => {
    it('sends JSON content type header', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['Content-Type']).toBe('application/json')
    })

    it('sends POST request', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      expect(options.method).toBe('POST')
    })

    it('sends event as JSON string in body', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 201 })

      const req = { path: '/test', method: 'GET' } as Request
      const res = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 0)
        })
      } as unknown as Response
      const next = vi.fn() as NextFunction

      const middleware = observabilityMiddleware()
      middleware(req, res, next)

      await new Promise(resolve => setTimeout(resolve, 50))

      const [, options] = mockFetch.mock.calls[0]
      expect(typeof options.body).toBe('string')
      expect(() => JSON.parse(options.body)).not.toThrow()
    })
  })
})
