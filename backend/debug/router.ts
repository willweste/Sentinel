import { Router } from 'express'
import { eventBuffer } from '../storage/eventBuffer.factory.js'

const router = Router()

// GET /api/v1/debug/events — retrieve stored events for verification
router.get('/api/v1/debug/events', async (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 15

  try {
    const events = await eventBuffer.getEventsInWindow(windowMinutes)
    const totalEvents = await eventBuffer.getEventCount()

    res.json({
      window_minutes: windowMinutes,
      events_in_window: events.length,
      total_events: totalEvents,
      events: events,
    })
  } catch (error) {
    console.error('[Debug] Events query failed:', error)
    res.status(500).json({ error: 'Failed to retrieve events' })
  }
})

// GET /api/v1/debug/stats — get buffer statistics
router.get('/api/v1/debug/stats', async (req, res) => {
  try {
    const totalEvents = await eventBuffer.getEventCount()
    const recentEvents = await eventBuffer.getEventsInWindow(5)

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
  } catch (error) {
    console.error('[Debug] Stats query failed:', error)
    res.status(500).json({ error: 'Failed to retrieve stats' })
  }
})

export default router
