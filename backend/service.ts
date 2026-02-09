import express from 'express'
import ingestionRouter from './ingestion/router.js'
import apiRouter from './api/router.js'
import debugRouter from './debug/router.js'

const app = express()
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

app.use(express.json())

app.use(ingestionRouter)
app.use(apiRouter)
app.use(debugRouter)

app.listen(port, () => {
  console.log(`Sentinel backend on port ${port}`)
  console.log(`  Ingestion: POST http://localhost:${port}/api/v1/events`)
  console.log(`  API:       GET  http://localhost:${port}/api/v1/analytics/top-tenants/errors`)
  console.log(`  API:       GET  http://localhost:${port}/api/v1/analytics/top-tenants/latency`)
  console.log(`  Debug:     GET  http://localhost:${port}/api/v1/debug/events`)
  console.log(`  Debug:     GET  http://localhost:${port}/api/v1/debug/stats`)
})
