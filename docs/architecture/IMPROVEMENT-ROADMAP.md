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
- ARCH-019 in progress (`#76`, branch `chore/arch-019-error-model-v2-i18n-envelope`)
- ARCH-020 planned (`#77`)
- ARCH-022 planned (`#79`)

## Target Architecture Principles

- Domain contains pure business invariants and state transitions.
- Application contains use-case orchestration, ports, idempotency flow, and audit coordination.
- API/infra contains request parsing, dependency wiring, transport mapping, and adapters.
- External SDKs remain isolated at infrastructure edges.
- Canonical contracts/events are explicit and versioned.

## Current Prioritized Sequence

1. ARCH-019: error model v2 and i18n-ready envelope (in progress)
2. ARCH-020: full operational observability baseline (planned)
3. ARCH-022: performance, resilience, and readiness finalization (planned)

- Preserve ARCH-018/ARCH-021 contract and CI/security baselines while hardening runtime standards through ARCH-019/020 before final readiness in ARCH-022.

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

## Next execution focus: ARCH-019

- Standardize Error v2 envelope across handlers and API error mapping.
- Ensure i18n-ready response structure (stable error code + translation key + metadata).
- Define clear compatibility rules to support ARCH-020 observability and ARCH-022 readiness baselines.
