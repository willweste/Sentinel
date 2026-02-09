# Sentinel Backend (MVP)

Minimal structure: `ingestion/`, `aggregation/`, `api/`. No DB in this stub.

## Run

```bash
npm install
npm run dev
```

- **POST /api/v1/events** — ingest request events (validate only, no storage yet)
- **GET /api/v1/analytics/top-tenants/errors** — stub, returns `[]`
- **GET /api/v1/analytics/top-tenants/latency** — stub, returns `[]`

Implement aggregation and storage as you build.
