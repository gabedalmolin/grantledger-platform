# GrantLedger Architecture Improvement Roadmap

## Context

This roadmap tracks architecture improvement as a continuous stream that stays grounded in real structural risk, not abstract refactoring for its own sake.

Canonical references:

- Tracker: `docs/architecture/ARCH-TRACKER.md`
- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Health check: `docs/governance/architecture-health-check.md`
- Boundary decision: `docs/adr/ADR-005-domain-vs-application-boundary.md`

## Current Platform Baseline

The platform baseline is complete through `ARCH-033`.

That baseline now includes:

- schema-first contracts and OpenAPI validation;
- shared time/error/idempotency foundations;
- durable webhook and invoice infrastructure in Postgres;
- executable API and worker runtimes with validated environment contracts;
- Prometheus-style metrics, structured logs, and Grafana/Prometheus assets;
- a self-hosted deployment stack with smoke validation;
- a guided demo path for end-to-end local demonstration;
- supply-chain and container security automation.

## Progress Snapshot

### Completed baseline waves

- `ARCH-001` to `ARCH-012`
  - completed core boundary, validation, time, error, idempotency, i18n, and async invoice hardening foundations
- `ARCH-018`
  - completed schema-first request boundaries and OpenAPI generation (`#89`, merge `4c384d0`)
- `ARCH-019`
  - completed Error Model v2 and i18n-ready envelope (`#95`, merge `e56fc1d`)
- `ARCH-020`
  - completed operational observability baseline (`#97`, merge `6f1f833`)
- `ARCH-021`
  - completed CI/security quality gates (`#90`, merge `b007968`)
- `ARCH-022`
  - completed readiness/performance finalisation (`#99`, merge `fb43b20`)
- `ARCH-023`
  - completed Postgres persistence regression coverage hardening (`#115`, merge `e749552`)
- `ARCH-024`
  - completed durable webhook idempotency and audit persistence (`#122`, merge `8b77832`)
- `ARCH-025`
  - completed bootstrap and boundary coverage hardening (`#146`, merge `5bd8c97`)
- `ARCH-026`
  - completed invoice orchestration decomposition (`#147`, merge `29c4086`)
- `ARCH-027`
  - completed workspace DX and build-artefact decoupling (`#148`, merge `579db19`)
- `ARCH-028`
  - completed deployable API/worker runtime baseline (`#149`, merge `2303ccd`)
- `ARCH-029`
  - completed runtime security and environment contracts (`#155`, merge `3524fa5`)
- `ARCH-030`
  - completed runtime metrics and operational observability stack (`#156`, merge `ad79c6b`)
- `ARCH-031`
  - completed self-hosted deployment baseline and smoke validation (`#157`, merge `50f780f`)
- `ARCH-032`
  - completed guided demo scenario and seeded billing walkthrough (`#158`, merge `d01d1ee`)
- `ARCH-033`
  - completed supply-chain and container security baseline (`#159`, merge `5fad62e`)

## Next Prioritised Sequence

### ARCH-035 - Decompose API server runtime and HTTP host boundary

- Issue: `#174`
- Why next:
  - `apps/api/src/server.ts` is now the clearest runtime hotspot;
  - decomposing it reduces future coupling in request parsing, metrics, health/readiness, and host assembly.

### ARCH-036 - Decompose idempotency and subscription orchestration

- Issue: `#175`
- Why after `ARCH-035`:
  - idempotency and subscription remain central application hotspots;
  - they deserve the same stable-facade, incremental decomposition approach used successfully in invoice orchestration.

### ARCH-037 - Deepen billing catalog, plan-version, and entitlement realism

- Issue: `#176`
- Why after the refactors:
  - the next major leverage after platform hardening is stronger product realism;
  - billing depth should be expanded on top of a cleaner application/runtime structure, not in parallel with hotspot cleanup.

## Delivery Strategy

- One architecture issue per PR.
- Keep architecture PRs focused and reviewable.
- Do not mix unrelated product scope into ARCH waves.
- Preserve a stable public surface unless a change is explicitly intentional and documented.
- Required gates per PR:
  - `npm run quality:gate`
  - `DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' npm run test:pg`
  - CI/security evidence for the relevant workflows

## Success Criteria

The roadmap is succeeding when:

- governance documents accurately reflect delivered architecture;
- the next structural hotspots become easier to navigate and safer to change;
- product depth increases without eroding the current platform baseline;
- new ARCH waves are opened because of concrete leverage, not inertia.
