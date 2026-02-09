import { Request, Response, NextFunction } from 'express'

export interface ObservabilityConfig {
  ingestionUrl: string
  apiKey?: string
  serviceName?: string
  enabled?: boolean
}

// Default config
const defaultConfig: ObservabilityConfig = {
  ingestionUrl: 'http://localhost:3000/api/v1/events',
  enabled: true
}

export const observabilityMiddleware = (config?: Partial<ObservabilityConfig>) => {
  const finalConfig = { ...defaultConfig, ...config }
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip observability for ingestion and analytics endpoints
    // These are internal endpoints and shouldn't be tracked
    if (req.path.startsWith('/api/v1/events') || req.path.startsWith('/api/v1/analytics')) {
      return next()
    }
    
    if (!finalConfig.enabled) {
      return next()
    }
    
    const startTime = Date.now()
    
    // Capture response when it finishes
    res.on('finish', () => {
      const latency = Date.now() - startTime
      
      // Create event object
      const event = {
        timestamp: new Date().toISOString(),
        tenant_id: req.tenantId || 'unknown',
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        latency_ms: latency,
        service: finalConfig.serviceName || 'unknown-service'
      }
      
      // Send to ingestion API (async, non-blocking)
      sendToIngestionAPI(event, finalConfig).catch(err => {
        // Log error but don't block request
        console.error('Failed to send event to ingestion API:', err)
      })
    })
    
    next()
  }
}

async function sendToIngestionAPI(event: any, config: ObservabilityConfig) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  
  const response = await fetch(config.ingestionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(event)
  })
  
  if (!response.ok) {
    throw new Error(`Ingestion API returned ${response.status}`)
  }
}
