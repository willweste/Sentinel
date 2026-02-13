/**
 * Redis test utilities
 *
 * For integration tests, we use the real Redis instance from docker-compose.
 * Make sure Redis is running before running integration tests:
 *   docker-compose up -d redis
 */

import { getRedisClient } from '../../redis/client.js'

/**
 * Get a Redis client for testing (uses the real Redis instance)
 */
export async function getTestRedisClient() {
  return await getRedisClient()
}

/**
 * Clear all test data from Redis (clears entire database)
 */
export async function clearTestRedis() {
  const redis = await getTestRedisClient()
  await redis.flushDb()
}

/**
 * Clear only Sentinel event data (safer for shared Redis)
 */
export async function clearSentinelEvents() {
  const redis = await getTestRedisClient()
  const keys = await redis.keys('sentinel:*')
  if (keys.length > 0) {
    await redis.del(keys)
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeTestRedis() {
  const redis = await getTestRedisClient()
  try {
    await redis.quit()
  } catch (error) {
    // Ignore errors during cleanup
  }
}
