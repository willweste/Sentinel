import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import ingestionRouter from './router.js'
import * as redisEventBuffer from '../storage/redisEventBuffer.js'

// Mock the eventBuffer
vi.mock('../storage/redisEventBuffer.js', () => ({
  eventBuffer: {
    addEvent: vi.fn()
  }
}))

describe('Ingestion Router', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use(ingestionRouter)
  })

  describe('POST /api/v1/events', () => {
    describe('successful event ingestion', () => {
      it('accepts valid event with all required fields', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'test-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/test',
            method: 'GET',
            status_code: 200,
            latency_ms: 100,
            service: 'test-service'
          })

        expect(response.status).toBe(201)
        expect(response.body).toEqual({ status: 'received' })
        expect(redisEventBuffer.eventBuffer.addEvent).toHaveBeenCalledOnce()
      })

      it('accepts event with minimal required fields', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'minimal-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/minimal'
          })

        expect(response.status).toBe(201)
        expect(response.body).toEqual({ status: 'received' })
      })

      it('accepts event with optional fields', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const event = {
          tenant_id: 'full-tenant',
          timestamp: new Date().toISOString(),
          endpoint: '/api/full',
          method: 'POST',
          status_code: 201,
          latency_ms: 250,
          service: 'user-service',
          custom_field: 'custom_value' // Extra fields should be accepted
        }

        const response = await request(app)
          .post('/api/v1/events')
          .send(event)

        expect(response.status).toBe(201)
        expect(redisEventBuffer.eventBuffer.addEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tenant_id: 'full-tenant',
            endpoint: '/api/full'
          })
        )
      })

      it('stores event with eventBuffer.addEvent', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const event = {
          tenant_id: 'storage-test',
          timestamp: '2026-02-12T12:00:00Z',
          endpoint: '/api/storage'
        }

        await request(app)
          .post('/api/v1/events')
          .send(event)

        expect(redisEventBuffer.eventBuffer.addEvent).toHaveBeenCalledWith(event)
      })
    })

    describe('validation errors', () => {
      it('rejects event missing tenant_id', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({
            timestamp: new Date().toISOString(),
            endpoint: '/api/test'
          })

        expect(response.status).toBe(400)
        expect(response.body).toEqual({
          error: 'Missing required fields: tenant_id, timestamp, endpoint'
        })
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })

      it('rejects event missing timestamp', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'test-tenant',
            endpoint: '/api/test'
          })

        expect(response.status).toBe(400)
        expect(response.body.error).toContain('Missing required fields')
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })

      it('rejects event missing endpoint', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'test-tenant',
            timestamp: new Date().toISOString()
          })

        expect(response.status).toBe(400)
        expect(response.body.error).toContain('Missing required fields')
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })

      it('rejects empty request body', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({})

        expect(response.status).toBe(400)
        expect(response.body.error).toContain('Missing required fields')
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })

      it('rejects null request body', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send(null)

        expect(response.status).toBe(400)
      })

      it('rejects event with empty string tenant_id', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: '',
            timestamp: new Date().toISOString(),
            endpoint: '/api/test'
          })

        expect(response.status).toBe(400)
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })

      it('rejects event with empty string endpoint', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'test-tenant',
            timestamp: new Date().toISOString(),
            endpoint: ''
          })

        expect(response.status).toBe(400)
        expect(redisEventBuffer.eventBuffer.addEvent).not.toHaveBeenCalled()
      })
    })

    describe('error handling', () => {
      it('returns 500 when eventBuffer.addEvent fails', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockRejectedValue(
          new Error('Redis connection failed')
        )

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'error-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/error'
          })

        expect(response.status).toBe(500)
        expect(response.body).toEqual({ error: 'Failed to store event' })
      })

      it('handles storage timeout gracefully', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockRejectedValue(
          new Error('Timeout')
        )

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'timeout-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/timeout'
          })

        expect(response.status).toBe(500)
        expect(response.body.error).toBe('Failed to store event')
      })
    })

    describe('content type handling', () => {
      it('requires JSON content type', async () => {
        const response = await request(app)
          .post('/api/v1/events')
          .send('not-json')
          .set('Content-Type', 'text/plain')

        expect(response.status).toBe(400)
      })

      it('accepts application/json content type', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'json-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/json'
          })
          .set('Content-Type', 'application/json')

        expect(response.status).toBe(201)
      })
    })

    describe('real-world event scenarios', () => {
      it('accepts event from Express middleware', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'acme-corp',
            timestamp: '2026-02-12T10:30:00.123Z',
            endpoint: '/api/users/123',
            method: 'GET',
            status_code: 200,
            latency_ms: 45,
            service: 'user-api'
          })

        expect(response.status).toBe(201)
      })

      it('accepts high-latency event', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'slow-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/slow',
            method: 'POST',
            status_code: 200,
            latency_ms: 5000,
            service: 'slow-service'
          })

        expect(response.status).toBe(201)
      })

      it('accepts error event (5xx status)', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const response = await request(app)
          .post('/api/v1/events')
          .send({
            tenant_id: 'error-tenant',
            timestamp: new Date().toISOString(),
            endpoint: '/api/failing',
            method: 'POST',
            status_code: 500,
            latency_ms: 100,
            service: 'broken-service'
          })

        expect(response.status).toBe(201)
      })

      it('accepts event from different HTTP methods', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

        for (const method of methods) {
          const response = await request(app)
            .post('/api/v1/events')
            .send({
              tenant_id: 'method-tenant',
              timestamp: new Date().toISOString(),
              endpoint: `/api/resource`,
              method,
              status_code: 200,
              latency_ms: 50
            })

          expect(response.status).toBe(201)
        }
      })
    })

    describe('concurrent requests', () => {
      it('handles multiple concurrent event submissions', async () => {
        vi.mocked(redisEventBuffer.eventBuffer.addEvent).mockResolvedValue()

        const requests = Array.from({ length: 10 }, (_, i) =>
          request(app)
            .post('/api/v1/events')
            .send({
              tenant_id: `tenant-${i}`,
              timestamp: new Date().toISOString(),
              endpoint: '/api/concurrent'
            })
        )

        const responses = await Promise.all(requests)

        responses.forEach(response => {
          expect(response.status).toBe(201)
        })
        expect(redisEventBuffer.eventBuffer.addEvent).toHaveBeenCalledTimes(10)
      })
    })
  })
})
