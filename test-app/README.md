# Sentinel test app

Small Express app with Sentinel SDK middleware. Use it to generate request traffic and see events flow into the Sentinel backend.

## Prerequisites

1. **Build the SDK** (once):

   ```bash
   cd ../sdk && npm install && npm run build && cd ../test-app
   ```

2. **Run the Sentinel backend** in another terminal (e.g. `cd backend && npm run dev`).

## Run

```bash
npm install
npm run dev
```

Server runs at **http://localhost:4000** (override with `PORT=4001 npm run dev`).

## Endpoints

| Route              | Method | Description                    |
|--------------------|--------|--------------------------------|
| `/`                | GET    | Health, echoes `tenant_id`     |
| `/api/v1/users`    | GET    | Sample success response        |
| `/api/v1/process`  | POST   | Sample success response        |
| `/api/v1/error`    | GET    | Returns 500 (for error tests)  |

Send **`x-tenant-id`** (or **`x-api-key`**) so requests are attributed to a tenant. Each request sends one event to the Sentinel ingestion URL (default `http://localhost:3000/api/v1/events`).

## Example

```bash
# Backend on 3000, test-app on 4000
curl -H "x-tenant-id: acme"     http://localhost:4000/api/v1/users
curl -H "x-tenant-id: acme"     http://localhost:4000/api/v1/error   # 500
curl -H "x-tenant-id: beta"     http://localhost:4000/api/v1/users
```

Then check ingestion (e.g. `curl http://localhost:3000/api/v1/analytics/top-tenants/errors` once aggregation is implemented).

## Config

- **PORT** – server port (default `4000`)
- **SENTINEL_INGESTION_URL** – Sentinel events endpoint (default `http://localhost:3000/api/v1/events`)
