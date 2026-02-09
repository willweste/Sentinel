import { Router } from 'express'
import { eventBuffer } from '../storage/eventBuffer.js'

const router = Router()

// GET /api/v1/debug/events — retrieve stored events for verification
router.get('/api/v1/debug/events', (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 15

  const events = eventBuffer.getEventsInWindow(windowMinutes)
  const totalEvents = eventBuffer.getEventCount()

  res.json({
    window_minutes: windowMinutes,
    events_in_window: events.length,
    total_events: totalEvents,
    events: events,
  })
})

// GET /api/v1/debug/stats — get buffer statistics
router.get('/api/v1/debug/stats', (req, res) => {
  const totalEvents = eventBuffer.getEventCount()
  const recentEvents = eventBuffer.getEventsInWindow(5)

  // Calculate some basic stats
  const tenantCounts = new Map<string, number>()
  recentEvents.forEach((event) => {
    tenantCounts.set(event.tenant_id, (tenantCounts.get(event.tenant_id) || 0) + 1)
  })

  res.json({
    total_events: totalEvents,
    events_last_5min: recentEvents.length,
    unique_tenants_last_5min: tenantCounts.size,
    tenant_distribution: Object.fromEntries(tenantCounts),
  })
})

export default router
