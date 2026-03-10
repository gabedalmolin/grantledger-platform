# Self-Hosted Deployment Baseline

This directory contains the first production-like self-hosted stack for GrantLedger.

## Included services

- `postgres`
- `migrate`
- `api`
- `worker`
- `prometheus`
- `grafana`

## Quick start

```bash
cp deploy/self-hosted/.env.example deploy/self-hosted/.env
npm run selfhost:smoke
```

## What the smoke path validates

- Docker images build successfully
- Postgres becomes healthy
- Database migrations complete
- API becomes healthy and ready
- Worker metrics server is reachable
- Prometheus is scraping runtime metrics
- Grafana is reachable with provisioning mounted

## Important notes

- The root `docker-compose.yml` remains the local development baseline for Postgres only.
- This stack is intentionally separate so local development and production-like validation do not fight each other.
- Grafana is exposed on port `13001` by default to avoid clashing with the API runtime.


## Guided demo

After the stack is up, you can run the guided billing walkthrough from the repository root:

```bash
npm run demo:selfhost
```

For a step-by-step explanation, see `docs/demo/guided-billing-walkthrough.md`.
