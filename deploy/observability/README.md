# Observability Assets

This directory contains the first self-hostable observability assets for GrantLedger.

Current scope:

- `prometheus.local.yml`
  - scrape configuration for a locally running API and worker
- `grafana/dashboards/grantledger-runtime.json`
  - starter dashboard covering API and worker runtime signals

Expected local targets:

- API metrics: `http://localhost:3000/metrics`
- Worker metrics: `http://localhost:9464/metrics`

This baseline is intentionally small. The full self-hosted stack wiring arrives in the deployment wave.
