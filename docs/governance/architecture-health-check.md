# Architecture Health Check

## Purpose

Keep the post-`ARCH-033` platform baseline healthy without creating process for its own sake.

## Cadence

- monthly review; or
- immediate review after a material production-like incident, failed smoke path, or broken architecture/security baseline.

## Inputs

Review the following artefacts before deciding whether a new ARCH issue is necessary:

- `README.md`
- `docs/architecture/ARCH-TRACKER.md`
- `docs/architecture/IMPROVEMENT-ROADMAP.md`
- `docs/governance/security-operations.md`
- `deploy/self-hosted/README.md`
- current CI/security workflow status

## Checklist

1. Runtime security and environment contracts still reflect the actual API and worker startup behaviour.
2. Schema-first boundaries, error model conventions, and idempotency guarantees remain intact.
3. Health, readiness, and metrics endpoints still behave as documented.
4. Self-hosted smoke validation still proves the stack can boot end to end.
5. Observability assets (Prometheus/Grafana) still match the current runtime surface.
6. Demo flow documentation still matches the actual seeded walkthrough.
7. Supply-chain security automation (Dependency Audit, CodeQL, Trivy, SBOM generation) is still green and relevant.
8. Governance documents are aligned with the current `main` baseline rather than an earlier checkpoint.
9. The next proposed ARCH wave is justified by a concrete hotspot, structural risk, or leverage opportunity.

## Decision Outcomes

Record a short decision note in a GitHub issue or PR thread:

- `No action required`
  - the current platform baseline is healthy
- `Open new ARCH issue`
  - a concrete structural gap or risk justifies a scoped new wave
- `Refresh governance/docs`
  - code is healthy, but tracker/roadmap/README/health-check drift needs correction

## Current Review Posture

As of the `ARCH-033` baseline:

- the platform runtime, observability, self-hosted, demo, and security foundations are in place;
- the next likely ARCH candidates are documentation/governance sync and the remaining application/runtime hotspots;
- new architecture work should remain issue-driven and explicitly justified.
