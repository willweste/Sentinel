# Sentinel Docker Setup Guide

This guide explains how to run Sentinel with Redis persistence using Docker Compose.

## Quick Start

### 1. Start all services with Docker Compose

```bash
cd /Users/willweste/Development/Sentinel
docker-compose up --build
```

This will start:
- **Redis** (port 6379) - Persistent event storage
- **Backend** (port 3000) - Sentinel API with Redis storage
- **Test-app** (port 4000) - Example app with SDK integration

### 2. Verify services are running

```bash
# Check all containers are healthy
docker-compose ps

# View logs
docker-compose logs -f

# Check backend health
curl http://localhost:3000/api/v1/debug/stats
```

### 3. Generate test traffic

```bash
# Generate events through test-app
for i in {1..20}; do
  curl -H "x-tenant-id: tenant-a" http://localhost:4000/api/v1/users
  curl -H "x-tenant-id: tenant-b" http://localhost:4000/api/v1/error
done

# View analytics
curl "http://localhost:3000/api/v1/analytics/top-tenants/errors?window=5&limit=10"
curl "http://localhost:3000/api/v1/analytics/top-tenants/latency?window=5&limit=10"
```

### 4. Test persistence across restarts

```bash
# Restart backend (Redis keeps data)
docker-compose restart backend

# Events should still be there
curl "http://localhost:3000/api/v1/debug/events?window=15"
```

## Storage Modes

The backend supports two storage modes via the `EVENT_STORAGE` environment variable:

### Redis Storage (Production)
```yaml
environment:
  - EVENT_STORAGE=redis
  - REDIS_URL=redis://redis:6379
```

**Benefits:**
- Data persists across restarts
- Horizontal scaling (multiple backend instances)
- Production-ready

### In-Memory Storage (Development)
```yaml
environment:
  - EVENT_STORAGE=memory
```

**Benefits:**
- No Redis dependency
- Faster for local development
- Data lost on restart

## Development Workflow

### Run backend locally with Redis in Docker

```bash
# Start only Redis
docker run -d -p 6379:6379 --name sentinel-redis redis:7-alpine

# Run backend locally
cd backend
export EVENT_STORAGE=redis
export REDIS_URL=redis://localhost:6379
npm install
npm run dev
```

### Run backend locally with in-memory storage

```bash
cd backend
export EVENT_STORAGE=memory
npm run dev
```

## Useful Commands

### View Redis data directly
```bash
docker-compose exec redis redis-cli

# Inside redis-cli:
ZCARD sentinel:events              # Count of events
ZRANGE sentinel:events 0 5         # First 5 events
TTL sentinel:events                # TTL in seconds
```

### Scale backend horizontally
```bash
docker-compose up --scale backend=3 -d
```

### Stop and cleanup
```bash
docker-compose down              # Stop services
docker-compose down -v           # Stop and remove volumes (deletes data)
```

### View container logs
```bash
docker-compose logs backend      # Backend logs
docker-compose logs redis        # Redis logs
docker-compose logs -f           # Follow all logs
```

## Environment Variables

See `.env.example` for all available configuration options:

- `PORT` - HTTP server port (default: 3000 for backend, 4000 for test-app)
- `REDIS_URL` - Redis connection string (default: redis://localhost:6379)
- `EVENT_STORAGE` - Storage type: `redis` or `memory` (default: memory)
- `SENTINEL_INGESTION_URL` - Backend URL for SDK (default: http://localhost:3000/api/v1/events)

## Troubleshooting

### Backend can't connect to Redis
```bash
# Check Redis is running
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker-compose exec redis redis-cli ping
```

### Services won't start
```bash
# Rebuild images
docker-compose build --no-cache

# Check for port conflicts
lsof -i :3000
lsof -i :4000
lsof -i :6379
```

### Data not persisting
```bash
# Verify EVENT_STORAGE=redis in docker-compose.yml
docker-compose exec backend env | grep EVENT_STORAGE

# Check Redis has data
docker-compose exec redis redis-cli ZCARD sentinel:events
```

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   test-app      │────────>│    backend      │
│   (port 4000)   │  HTTP   │   (port 3000)   │
└─────────────────┘         └────────┬────────┘
                                     │
                                     │ Redis
                                     │ Protocol
                                     ▼
                            ┌─────────────────┐
                            │     Redis       │
                            │   (port 6379)   │
                            └─────────────────┘
```

## Files Created

**Docker Configuration:**
- `docker-compose.yml` - Multi-service orchestration
- `backend/Dockerfile` - Backend container image
- `test-app/Dockerfile` - Test-app container image
- `backend/.dockerignore` - Build optimization
- `test-app/.dockerignore` - Build optimization
- `.env.example` - Environment variable documentation

**Redis Implementation:**
- `backend/redis/client.ts` - Redis connection singleton
- `backend/storage/redisEventBuffer.ts` - Redis-backed event storage
- `backend/storage/eventBuffer.factory.ts` - Storage factory pattern

**Modified Files:**
- `backend/package.json` - Added `redis` dependency
- `backend/ingestion/router.ts` - Async event ingestion
- `backend/aggregation/metrics.ts` - Async aggregation
- `backend/api/router.ts` - Async API endpoints
- `backend/debug/router.ts` - Async debug endpoints
