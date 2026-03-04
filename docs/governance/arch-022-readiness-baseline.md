# ARCH-022 Readiness Baseline

## Goal
Define a practical readiness baseline for performance, resilience, and operational response.

## Scope
- API request/response critical paths
- Invoice worker processing loop
- Webhook ingestion flow

## SLI/SLO Targets (Initial)
### API
- SLI: `p95` handler latency (critical write endpoints)
- SLO: `p95 < 300ms` (excluding external provider latency)
- SLI: 5xx rate
- SLO: `< 1%` over rolling 15 minutes

### Worker
- SLI: job cycle duration (`invoice_worker_cycle.durationMs`)
- SLO: `p95 < 2000ms`
- SLI: terminal failure rate (`terminalFailureRate`)
- SLO: `< 2%` over rolling 1 hour

### Webhooks
- SLI: invalid signature rate
- SLO: `< 0.5%` over rolling 1 hour
- SLI: duplicate processing ratio
- SLO: monitored, no hard threshold initially

## Alerting Baseline
- API 5xx rate above threshold for 10 minutes -> page on-call
- Worker terminal failure rate above threshold for 10 minutes -> page on-call
- Queue depth sustained growth for 15 minutes -> high-priority alert
- Webhook invalid signature spike (3x baseline) -> security review alert

## Runbook Baseline
- Primary runbook: `docs/governance/runbook-invoice-worker.md`
- Expected response:
  1. Detect
  2. Triage
  3. Mitigate
  4. Recover
  5. Record incident notes

## Exit Criteria for ARCH-022
- SLI/SLO targets documented and agreed
- Alert thresholds documented
- Runbook baseline documented and linked
- CI/quality gates unchanged and green
