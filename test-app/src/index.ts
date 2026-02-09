import express from 'express'
import { tenantMiddleware, observabilityMiddleware } from '@sentinel/observability'

const app = express()
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000
const sentinelUrl = process.env.SENTINEL_INGESTION_URL || 'http://localhost:3000/api/v1/events'

app.use(express.json())

// Sentinel: tenant first, then observability (so each request sends one event to Sentinel)
app.use(tenantMiddleware())
app.use(
  observabilityMiddleware({
    ingestionUrl: sentinelUrl,
    serviceName: 'test-app',
  })
)

// Routes (all get tenant_id from x-tenant-id header and report to Sentinel)

app.get('/', (req, res) => {
  res.json({ status: 'ok', tenant_id: req.tenantId })
})

app.get('/api/v1/users', (req, res) => {
  res.json({
    users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    tenant_id: req.tenantId,
  })
})

app.post('/api/v1/process', (req, res) => {
  res.json({
    result: 'processed',
    tenant_id: req.tenantId,
    timestamp: new Date().toISOString(),
  })
})

// Intentionally returns 500 so you can test error attribution
app.get('/api/v1/error', (_req, res) => {
  res.status(500).json({ error: 'Internal server error', tenant_id: _req.tenantId })
})

app.listen(port, () => {
  console.log(`Test app on http://localhost:${port}`)
  console.log(`  Sentinel ingestion: ${sentinelUrl}`)
  console.log(`  Try: curl -H "x-tenant-id: acme" http://localhost:${port}/api/v1/users`)
})
