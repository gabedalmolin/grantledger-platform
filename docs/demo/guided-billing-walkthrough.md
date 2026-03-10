# Guided Billing Walkthrough

This walkthrough demonstrates GrantLedger as a coherent self-hosted billing system, not just a set of isolated components.

It exercises:

- API request handling
- Postgres-backed durable persistence
- worker processing
- API and worker metrics
- Prometheus scrape readiness

## Demo identity and seeded scenario

The walkthrough uses the built-in demo request context currently recognised by the API layer:

- `x-user-id: u_1`
- `x-tenant-id: t_1`

The seed step creates a deterministic demo subscription for that tenant:

- `subscriptionId: sub_demo_basic`
- `customerId: cus_demo_acme`
- `planId: plan_demo_basic`
- `planVersionId: plan_demo_basic_v1`

## Prerequisites

- Docker running locally
- `npm ci` already executed in the repository root

## Start the self-hosted stack

```bash
cp deploy/self-hosted/.env.example deploy/self-hosted/.env
docker compose -f deploy/self-hosted/docker-compose.yml --env-file deploy/self-hosted/.env up -d --build
```

## Run the seeded walkthrough

```bash
npm run demo:selfhost
```

The script will:

1. verify that the API and worker are ready;
2. seed the demo subscription in Postgres if it does not already exist;
3. enqueue a new invoice-generation job through the API;
4. poll the job status until completion;
5. verify that API and worker metrics are exposed;
6. verify that Prometheus is ready to scrape the stack.

## Optional manual seed step

If your self-hosted stack uses a different database endpoint than the default demo assumption, export `DEMO_DATABASE_URL` before running either demo command.

If you want to initialise the demo subscription separately, run:

```bash
npm run demo:seed
```

## Runtime signals to observe

After the walkthrough succeeds, these endpoints should be useful:

- API health: `http://127.0.0.1:13000/healthz`
- API readiness: `http://127.0.0.1:13000/readyz`
- API metrics: `http://127.0.0.1:13000/metrics`
- Worker metrics: `http://127.0.0.1:19464/metrics`
- Prometheus: `http://127.0.0.1:19090`
- Grafana: `http://127.0.0.1:13001`

### Useful metrics to inspect

- `grantledger_api_http_requests_total`
- `grantledger_api_http_request_duration_seconds`
- `grantledger_worker_cycles_total`
- `grantledger_invoice_completed_count`
- `grantledger_invoice_queue_depth`

## Clean up

```bash
docker compose -f deploy/self-hosted/docker-compose.yml --env-file deploy/self-hosted/.env down --remove-orphans
```
