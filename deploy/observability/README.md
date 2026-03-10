# Observability Assets

This directory contains the local and self-hosted observability assets for GrantLedger.

## Included assets

- `prometheus.local.yml`
  - scrape configuration for a locally running API and worker
- `prometheus.self-hosted.yml`
  - scrape configuration for the self-hosted compose stack
- `grafana/dashboards/grantledger-runtime.json`
  - starter dashboard covering API and worker runtime signals
- `grafana/provisioning/`
  - datasource and dashboard provisioning for the self-hosted Grafana container

## Expected targets

### Local runtime

- API metrics: `http://localhost:3000/metrics`
- Worker metrics: `http://localhost:9464/metrics`

### Self-hosted stack

- API metrics: `http://api:3000/metrics`
- Worker metrics: `http://worker:9464/metrics`
- Prometheus: `http://prometheus:9090`
- Grafana: `http://grafana:3000`
