# Sentinel

Tenant-aware incident detection (MVP). Answers: **which tenant is causing elevated errors or latency right now?**

See [tenant-aware-observability.md](./tenant-aware-observability.md) for scope and repo structure.

```
sentinel/
├── sdk/           # middleware + index
├── backend/       # ingestion, aggregation, api
├── test-app/      # demo app with SDK (sends events to backend)
└── README.md
```
