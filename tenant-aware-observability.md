# Sentinel — Tenant Incident Detector (MVP)

## What this is

Sentinel is an open-source, tenant-aware incident detection service.

It answers one question, fast:

**"Which tenant is causing elevated errors or latency right now?"**

Sentinel is not a full observability platform. It does not replace Datadog, Sentry, or logs. It exists to shorten incident triage by making tenant attribution immediate.

## The problem this solves

In multi-tenant SaaS systems, incidents often start like this:

- Metrics show elevated errors or latency
- Overall system health looks "mostly fine"
- On-call asks: **"Is this one tenant or everyone?"**
- Investigation is manual: log searches, ad-hoc queries, tribal knowledge
- Frequently, the tenant reports the issue first

This happens because most observability tooling is service-centric, not tenant-centric. Sentinel makes tenant impact first-class.

## What Sentinel does (and does not do)

**Sentinel does**

- Attribute errors and latency to tenants
- Aggregate data over short rolling windows
- Rank tenants by contribution to incidents
- Optionally alert when one tenant dominates failures

**Sentinel does not**

- Provide full distributed tracing
- Store raw logs long-term
- Track costs or pricing tiers
- Expose dashboards to end customers
- Replace existing monitoring tools

This is a focused incident detection tool, not a monitoring suite.

## How it works (high level)

### 1) Small middleware / SDK in the application

At the API boundary, middleware emits one event per request with:

- `tenant_id`
- `endpoint` (normalized route)
- `status_code`
- `latency_ms`
- `timestamp`

The SDK is the sensor, not the system.

### 2) Sentinel ingestion service (self-hosted)

Sentinel runs as a self-hosted service inside your infrastructure.

- Receives request events over HTTP
- Validates and normalizes input
- Buffers events for processing
- Can be deployed as:
  - a standalone service
  - a Kubernetes deployment
  - a containerized process

You own and operate Sentinel. There is no required external SaaS dependency.

### 3) Rolling window aggregation

Sentinel aggregates events over short windows (e.g. 5–10 minutes):

For each tenant:

- request count
- error count (e.g. 5xx)
- error rate
- latency summaries (e.g. p95)

Aggregations are continuously updated and optimized for fast incident queries.

### 4) Incident-oriented outputs

Sentinel exposes one primary operational view:

**Top tenants contributing to system pain right now**, ranked by:

- error rate
- share of total errors
- latency deviation

**Example output:**

```
Top tenants by 5xx (last 10 minutes)
1. tenant_acme    68% of all 5xx  (endpoint: /v1/process)
2. tenant_beta    21%
3. tenant_gamma   7%
```

That's the product.

### Optional: proactive alerts

Sentinel can alert when:

- a tenant exceeds an absolute error threshold
- a tenant contributes more than X% of total failures
- a tenant's latency deviates sharply from baseline

**Example alert:**

> 🚨 Sentinel: Tenant acme responsible for 64% of 5xx in the last 10 minutes (endpoint /v1/process)

Alerts can be delivered via Slack, email, or webhooks.

## What the MVP includes

**In scope:**

- One SDK / middleware (Node or Python)
- One ingestion service
- Sliding window aggregation (5–10 minutes)
- APIs for:
  - Top tenants by error rate
  - Top tenants by latency
- Optional Slack alerting

**Out of scope (intentionally):**

- Full dashboards
- Distributed tracing
- Cost attribution
- Multi-region replication
- Customer-facing views
- AI / anomaly detection


## Cardinality strategy (important design constraint)

Sentinel avoids exploding metric cardinality by:

- ingesting event-style telemetry with `tenant_id`
- computing rollups internally
- querying only aggregated data
- avoiding per-tenant time series in Prometheus / Datadog

Handling tenant cardinality safely is a core design goal of this project.

## MVP success criteria

The MVP is successful if:

- During an incident, Sentinel can answer **"Which tenant is responsible?"** in seconds
- On-call engineers can act without log spelunking
- Tenants stop being the first alert
- No UI polish is required

## Repository structure (MVP)

Single repo, intentionally simple:

```
sentinel/
├── sdk/
│   ├── middleware/
│   └── index.ts
├── backend/
│   ├── ingestion/
│   ├── aggregation/
│   └── api/
└── README.md
```

Split repositories only if/when the SDK is published independently.

## How to describe Sentinel (resume-safe)

Preferred phrasing:

- **Tenant-aware incident detection**
- **Noisy-tenant isolation**
- **Customer-impact attribution**

**Example resume bullet:**

> Built an open-source, tenant-aware incident detection service that attributes errors and latency to individual customers using sliding window aggregation, enabling faster isolation of noisy tenants during production incidents.

## Summary

Sentinel (MVP) is:

- a focused, open-source incident detection tool
- built for multi-tenant SaaS systems
- designed to answer one painful on-call question
- intentionally small, opinionated, and finishable

This scope is:

- realistic
- valuable
- extensible
- excellent backend/infra practice
