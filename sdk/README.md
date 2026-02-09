# @sentinel/observability

Tenant-aware observability middleware for Express.js

## Installation

```bash
npm install @sentinel/observability
```

## Usage

```typescript
import express from 'express'
import { tenantMiddleware, observabilityMiddleware } from '@sentinel/observability'

const app = express()

// Configure middleware
app.use(tenantMiddleware()) // Extracts tenant_id from headers
app.use(observabilityMiddleware({
  ingestionUrl: 'https://api.sentinel.io/v1/events',
  apiKey: process.env.SENTINEL_API_KEY,
  serviceName: 'my-api'
}))

// Your routes
app.get('/api/users', (req, res) => {
  res.json({ users: [] })
})

app.listen(3000)
```

## Custom Tenant Extraction

```typescript
import { tenantMiddleware } from '@sentinel/observability'

// Custom extractor (e.g., from JWT)
app.use(tenantMiddleware((req) => {
  return req.user?.tenantId // If using auth middleware
}))
```
