import { Router } from 'express'
import { aggregateErrorMetrics, aggregateLatencyMetrics } from '../aggregation/metrics.js'

const router = Router()

// Top tenants by error rate (sliding window)
router.get('/api/v1/analytics/top-tenants/errors', async (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 5
  const limit = parseInt(req.query.limit as string) || 10

  try {
    const tenants = await aggregateErrorMetrics(windowMinutes, limit)

    res.json({
      window_minutes: windowMinutes,
      tenants,
    })
  } catch (error) {
    console.error('[API] Error analytics failed:', error)
    res.status(500).json({ error: 'Failed to aggregate error metrics' })
  }
})

// Top tenants by latency
router.get('/api/v1/analytics/top-tenants/latency', async (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 5
  const limit = parseInt(req.query.limit as string) || 10

  try {
    const tenants = await aggregateLatencyMetrics(windowMinutes, limit)

    res.json({
      window_minutes: windowMinutes,
      tenants,
    })
  } catch (error) {
    console.error('[API] Latency analytics failed:', error)
    res.status(500).json({ error: 'Failed to aggregate latency metrics' })
  }
})

export default router
