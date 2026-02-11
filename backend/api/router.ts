import { Router } from 'express'
import { aggregateErrorMetrics, aggregateLatencyMetrics } from '../aggregation/metrics.js'

const router = Router()

// Top tenants by error rate (sliding window)
router.get('/api/v1/analytics/top-tenants/errors', (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 5
  const limit = parseInt(req.query.limit as string) || 10

  const tenants = aggregateErrorMetrics(windowMinutes, limit)

  res.json({
    window_minutes: windowMinutes,
    tenants,
  })
})

// Top tenants by latency
router.get('/api/v1/analytics/top-tenants/latency', (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 5
  const limit = parseInt(req.query.limit as string) || 10

  const tenants = aggregateLatencyMetrics(windowMinutes, limit)

  res.json({
    window_minutes: windowMinutes,
    tenants,
  })
})

export default router
