/**
 * Factory pattern for event storage selection
 * Allows switching between in-memory and Redis storage via environment variable
 */

import { EventBuffer } from './eventBuffer.js'
import { RedisEventBuffer } from './redisEventBuffer.js'

export function createEventBuffer(retentionMinutes = 15, cleanupIntervalMinutes = 1) {
  const storageType = process.env.EVENT_STORAGE || 'memory'

  if (storageType === 'redis') {
    console.log('[EventBuffer] Using Redis storage')
    return new RedisEventBuffer(retentionMinutes, cleanupIntervalMinutes)
  }

  console.log('[EventBuffer] Using in-memory storage')
  return new EventBuffer(retentionMinutes, cleanupIntervalMinutes)
}

// Singleton export - used throughout the application
export const eventBuffer = createEventBuffer(15, 1)
