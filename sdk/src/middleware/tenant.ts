import { Request, Response, NextFunction } from 'express'

export interface TenantExtractor {
  (req: Request): string | undefined
}

export const tenantMiddleware = (extractTenantId?: TenantExtractor) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use custom extractor if provided, otherwise use default
    const tenantId = extractTenantId 
      ? extractTenantId(req)
      : (req.headers['x-api-key'] as string) || 
        (req.headers['x-tenant-id'] as string) || 
        undefined
    
    // Attach to request object for use in routes/other middleware
    if (tenantId) {
      req.tenantId = tenantId
    }
    
    next()
  }
}

// Default tenant extractor
export const defaultTenantExtractor: TenantExtractor = (req) => {
  return (req.headers['x-api-key'] as string) || 
         (req.headers['x-tenant-id'] as string) || 
         undefined
}
