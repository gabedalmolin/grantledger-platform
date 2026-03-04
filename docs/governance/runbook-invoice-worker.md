# Runbook - Invoice Worker

## Purpose
Guide incident response for degraded invoice processing behavior.

## Signals
- `invoice_worker_cycle` with elevated `durationMs`
- sustained `queueDepth` growth
- increased `terminalFailureRate`
- repeated `invoice_job_observer_error`

## Triage Checklist
1. Confirm deployment/version and recent config changes.
2. Check queue depth trend and failure trend.
3. Inspect logs by `traceId` and `jobId`.
4. Validate database connectivity and tenant context.
5. Confirm worker runtime config (`JOB_LEASE_SECONDS`, `JOB_HEARTBEAT_SECONDS`, `WORKER_TENANT_ID`).

## Immediate Mitigations
- Scale worker replicas if backlog is rising.
- Revert latest risky deployment if failure started right after release.
- Isolate malformed tenant payload sources when applicable.
- Pause non-critical replay/batch jobs temporarily.

## Recovery Verification
- Queue depth returning to normal trend.
- `terminalFailureRate` back below threshold.
- No sustained spike in failed worker cycles.
- Critical invoice flows confirmed by smoke checks.

## Post-Incident
- Register root cause and corrective actions.
- Add missing test coverage for reproduced scenario.
- Update SLI/SLO or alert threshold if needed.
