import { describe, it, expect, vi } from 'vitest'
import { tenantMiddleware, defaultTenantExtractor, type TenantExtractor } from './tenant.js'
import type { Request, Response, NextFunction } from 'express'

describe('tenantMiddleware', () => {
  describe('default extraction', () => {
    it('extracts tenant from x-api-key header', () => {
      const req = {
        headers: { 'x-api-key': 'tenant-123' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('tenant-123')
      expect(next).toHaveBeenCalledOnce()
    })

    it('extracts tenant from x-tenant-id header', () => {
      const req = {
        headers: { 'x-tenant-id': 'tenant-456' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('tenant-456')
      expect(next).toHaveBeenCalledOnce()
    })

    it('prefers x-api-key over x-tenant-id', () => {
      const req = {
        headers: {
          'x-api-key': 'from-api-key',
          'x-tenant-id': 'from-tenant-id'
        }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('from-api-key')
      expect(next).toHaveBeenCalledOnce()
    })

    it('does not set tenantId when no headers present', () => {
      const req = {
        headers: {}
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBeUndefined()
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles case-sensitive headers', () => {
      const req = {
        headers: { 'X-Api-Key': 'tenant-case' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      // Express normalizes headers to lowercase, so this should not match
      expect(req.tenantId).toBeUndefined()
      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('custom extractor', () => {
    it('uses custom extractor function', () => {
      const customExtractor: TenantExtractor = (req) => {
        return req.query?.tenant as string
      }

      const req = {
        headers: {},
        query: { tenant: 'custom-tenant' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(customExtractor)
      middleware(req, res, next)

      expect(req.tenantId).toBe('custom-tenant')
      expect(next).toHaveBeenCalledOnce()
    })

    it('extracts tenant from JWT bearer token', () => {
      const jwtExtractor: TenantExtractor = (req) => {
        const authHeader = req.headers.authorization
        if (authHeader?.startsWith('Bearer ')) {
          // In real app, would decode JWT. Here we just simulate it.
          const token = authHeader.substring(7)
          return token.split('.')[0] // Simplified: use first part as tenant
        }
        return undefined
      }

      const req = {
        headers: { authorization: 'Bearer tenant-jwt.payload.signature' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(jwtExtractor)
      middleware(req, res, next)

      expect(req.tenantId).toBe('tenant-jwt')
      expect(next).toHaveBeenCalledOnce()
    })

    it('extracts tenant from subdomain', () => {
      const subdomainExtractor: TenantExtractor = (req) => {
        const host = req.headers.host
        if (host) {
          const parts = host.split('.')
          if (parts.length > 2) {
            return parts[0] // Return subdomain as tenant
          }
        }
        return undefined
      }

      const req = {
        headers: { host: 'acme.app.example.com' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(subdomainExtractor)
      middleware(req, res, next)

      expect(req.tenantId).toBe('acme')
      expect(next).toHaveBeenCalledOnce()
    })

    it('does not set tenantId when custom extractor returns undefined', () => {
      const alwaysUndefinedExtractor: TenantExtractor = () => undefined

      const req = {
        headers: { 'x-api-key': 'should-be-ignored' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(alwaysUndefinedExtractor)
      middleware(req, res, next)

      expect(req.tenantId).toBeUndefined()
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles extractor throwing error gracefully', () => {
      const throwingExtractor: TenantExtractor = () => {
        throw new Error('Extractor error')
      }

      const req = {
        headers: {}
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(throwingExtractor)

      // Should throw the error (no error handling in middleware)
      expect(() => middleware(req, res, next)).toThrow('Extractor error')
    })

    it('allows extracting from request body', () => {
      const bodyExtractor: TenantExtractor = (req) => {
        return (req.body as any)?.tenantId
      }

      const req = {
        headers: {},
        body: { tenantId: 'body-tenant' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware(bodyExtractor)
      middleware(req, res, next)

      expect(req.tenantId).toBe('body-tenant')
      expect(next).toHaveBeenCalledOnce()
    })
  })

  describe('defaultTenantExtractor', () => {
    it('extracts from x-api-key header', () => {
      const req = {
        headers: { 'x-api-key': 'tenant-default' }
      } as unknown as Request

      const tenantId = defaultTenantExtractor(req)

      expect(tenantId).toBe('tenant-default')
    })

    it('extracts from x-tenant-id header', () => {
      const req = {
        headers: { 'x-tenant-id': 'tenant-alt' }
      } as unknown as Request

      const tenantId = defaultTenantExtractor(req)

      expect(tenantId).toBe('tenant-alt')
    })

    it('returns undefined when no headers present', () => {
      const req = {
        headers: {}
      } as unknown as Request

      const tenantId = defaultTenantExtractor(req)

      expect(tenantId).toBeUndefined()
    })

    it('prefers x-api-key over x-tenant-id', () => {
      const req = {
        headers: {
          'x-api-key': 'preferred',
          'x-tenant-id': 'fallback'
        }
      } as unknown as Request

      const tenantId = defaultTenantExtractor(req)

      expect(tenantId).toBe('preferred')
    })
  })

  describe('middleware chaining', () => {
    it('allows subsequent middleware to access tenantId', () => {
      const req = {
        headers: { 'x-api-key': 'chained-tenant' }
      } as unknown as Request
      const res = {} as Response

      let capturedTenantId: string | undefined

      const next = vi.fn(() => {
        capturedTenantId = req.tenantId
      }) as unknown as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(capturedTenantId).toBe('chained-tenant')
      expect(next).toHaveBeenCalledOnce()
    })

    it('can be used multiple times with different extractors', () => {
      const req = {
        headers: { 'x-api-key': 'header-tenant' },
        query: { tenant: 'query-tenant' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      // First middleware uses default
      const middleware1 = tenantMiddleware()
      middleware1(req, res, next)
      expect(req.tenantId).toBe('header-tenant')

      // Second middleware uses custom extractor (overwrites)
      const customExtractor: TenantExtractor = (req) => req.query?.tenant as string
      const middleware2 = tenantMiddleware(customExtractor)
      middleware2(req, res, next)
      expect(req.tenantId).toBe('query-tenant')

      expect(next).toHaveBeenCalledTimes(2)
    })
  })

  describe('edge cases', () => {
    it('handles empty string header values', () => {
      const req = {
        headers: { 'x-api-key': '' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      // Empty string is falsy, so tenantId should not be set
      expect(req.tenantId).toBeUndefined()
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles whitespace-only header values', () => {
      const req = {
        headers: { 'x-api-key': '   ' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      // Whitespace is truthy, so it will be set
      expect(req.tenantId).toBe('   ')
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles numeric header values', () => {
      const req = {
        headers: { 'x-api-key': '12345' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('12345')
      expect(next).toHaveBeenCalledOnce()
    })

    it('handles special characters in tenant ID', () => {
      const req = {
        headers: { 'x-api-key': 'tenant-123-abc_XYZ' }
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('tenant-123-abc_XYZ')
      expect(next).toHaveBeenCalledOnce()
    })

    it('does not modify request object beyond tenantId', () => {
      const req = {
        headers: { 'x-api-key': 'tenant-safe' },
        originalUrl: '/test',
        method: 'GET'
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn() as NextFunction

      const middleware = tenantMiddleware()
      middleware(req, res, next)

      expect(req.tenantId).toBe('tenant-safe')
      expect(req.originalUrl).toBe('/test')
      expect(req.method).toBe('GET')
      expect(Object.keys(req)).toContain('tenantId')
    })
  })
})
