import { Router } from 'express'
import { eventBuffer } from '../storage/redisEventBuffer.js'

const router = Router()

// POST /api/v1/events — receive request events from SDK middleware
router.post('/api/v1/events', async (req, res) => {
  const event = req.body

  if (!event?.tenant_id || !event?.timestamp || !event?.endpoint) {
    console.log('[Sentinel] Rejected event: missing required fields')
    return res.status(400).json({
      error: 'Missing required fields: tenant_id, timestamp, endpoint',
    })
  }

  console.log(
    `[Sentinel] Event received  tenant=${event.tenant_id}  endpoint=${event.endpoint}  status=${event.status_code ?? '?'}  latency=${event.latency_ms ?? '?'}ms`
  )

  // Store event in buffer
  try {
    await eventBuffer.addEvent(event)
    res.status(201).json({ status: 'received' })
  } catch (error) {
    console.error('[Ingestion] Failed to add event:', error)
    res.status(500).json({ error: 'Failed to store event' })
  }
})

export default router
