# GrantLedger Architecture Improvement Roadmap

## Context

This roadmap tracks architecture hardening as a continuous stream running in parallel with feature delivery.

Canonical references:

- Tracker: `docs/architecture/ARCH-TRACKER.md`
- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Boundary decision: `docs/adr/ADR-005-domain-vs-application-boundary.md`

## Progress Snapshot

- ARCH-001 completed (`#31`)
- ARCH-002 completed (`#32`)
- ARCH-003 completed (`#34`, merge `dc7404d`)
- ARCH-004 completed (`#37`, merge `46e6804`)
- ARCH-005 completed (`#40`, merge `b72ef69`)
- ARCH-006 completed (`#43`, merge `0706202`)
- ARCH-007 completed (`#46`, merge `64e2d3d`)
- ARCH-008 completed (`#49`, merge `bef4fbc`)
- ARCH-009 completed (`#53`, merge `5913159`)
- ARCH-010 completed (`#56`, merge `487c7bf`)
- ARCH-011 completed (`#59`, merge `e58acbb`)
- ARCH-012 completed (`#65`, merge `ea6db9a`)
- ARCH-018 completed (`#89`, `#92`, `#93`; merges `4c384d0`, `3faf3f0`, `9da76c7`)
- ARCH-021 completed (`#90`, merge `b007968`)
- ARCH-019 completed (`#95`, merge `e56fc1d`)
- ARCH-020 completed (`#77`, branch `chore/arch-020-observability-baseline`)
- ARCH-022 completed (`#99`, merge `fb43b20`)
- ARCH-023 completed (`#115`, merge `e749552`)

## Target Architecture Principles

- Domain contains pure business invariants and state transitions.
- Application contains use-case orchestration, ports, idempotency flow, and audit coordination.
- API/infra contains request parsing, dependency wiring, transport mapping, and adapters.
- External SDKs remain isolated at infrastructure edges.
- Canonical contracts/events are explicit and versioned.

## Current Prioritized Sequence

- ARCH stream hardening baseline completed through ARCH-023.
- New architecture increments should open new ARCH issues from concrete risks.

## Delivery Strategy

- One architecture issue per PR.
- Keep architecture PRs focused and reviewable.
- No unrelated business scope mixed into ARCH PRs.
- Required gates per PR:
  - `npm run quality:gate`
  - `DATABASE_URL=postgresql://grantledger:grantledger@localhost:5432/grantledger npm run test:pg` (CI mandatory)
  - Security baseline checks (`Dependency Audit`, `CodeQL`)

## Mandatory Governance Workflow (Always)

### Start of issue

- Mark issue as `IN_PROGRESS` in `ARCH-TRACKER.md`.
- Register issue link, branch name, and planned scope.
- Update roadmap focus/dependencies.
- Create ADR draft when new architectural decision is needed.

### End of issue (before merge)

- Mark issue as `DONE` in `ARCH-TRACKER.md`.
- Register PR link and merged SHA.
- Update roadmap next step and residual risks.
- Finalize ADR changes or explicitly register `No ADR change required`.

## Success Criteria for ARCH Stream

- No core business logic concentrated in monolithic modules.
- Layer boundaries are clear and reviewable.
- Validation, time policy, and error mapping are standardized.
- Idempotency orchestration is generic and reusable.
- Governance docs stay synchronized with code and PR lifecycle.

## Next execution focus: Architecture Backlog Refresh

- Monitor current baselines (CI/security/OpenAPI/observability) for regressions.
- Open a new ARCH issue only when a clear structural gap is identified.
- Preserve error-model, schema-first, and runtime fail-fast guardrails.
