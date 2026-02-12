import { createClient } from 'redis'

let redisClient: ReturnType<typeof createClient> | null = null

export async function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Redis] Max reconnection attempts reached')
            return new Error('Max reconnection attempts')
          }
          // Exponential backoff: 100ms, 200ms, 400ms, ... up to 3s
          return Math.min(retries * 100, 3000)
        },
      },
    })

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...')
    })

    await redisClient.connect()
  }

  return redisClient
}

export async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
