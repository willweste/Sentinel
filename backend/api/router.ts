import { Router } from 'express'

const router = Router()

// Top tenants by error rate (sliding window)
router.get('/api/v1/analytics/top-tenants/errors', (_req, res) => {
  // TODO: implement from aggregation
  res.json({ tenants: [] })
})

// Top tenants by latency
router.get('/api/v1/analytics/top-tenants/latency', (_req, res) => {
  // TODO: implement from aggregation
  res.json({ tenants: [] })
})

export default router
