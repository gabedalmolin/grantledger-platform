# ARCH-000 Tracker - Architecture Hardening

## Objective

Deliver structural improvements without blocking feature delivery.

## Canonical References

- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Roadmap: `docs/architecture/IMPROVEMENT-ROADMAP.md`
- Boundary ADR: `docs/adr/ADR-005-domain-vs-application-boundary.md`

## Scope

- Define and enforce Domain vs Application boundaries
- Modularize monolithic `index.ts` files
- Adopt schema-first validation with Zod
- Standardize date/time strategy with timezone support
- Standardize exception-to-API response mapping
- Introduce generic idempotency executor
- Introduce i18n foundation (`en_US` baseline)
- Finalize hardening for idempotency states, dedupe extraction, and style guidance
- Roll out async idempotent invoice generation across application, API, and worker

## Out of Scope

- Business feature expansion unrelated to architecture hardening

## Execution Strategy

- Keep architecture changes incremental and reviewable.
- Run in parallel with feature delivery using controlled WIP.
- Limit active architecture work to one child issue at a time.

## Required Update Timing (Always)

### Start of ARCH issue (branch/issue opened)

- Update this tracker with `IN_PROGRESS`, issue link, and branch name.
- Update `IMPROVEMENT-ROADMAP.md` with focus and dependencies.
- If a new architectural decision is needed, create/update ADR draft.
- If no ADR change is needed, register: `No ADR change required`.

### End of ARCH issue (before merge)

- Update this tracker with `DONE`, PR link, and merged SHA.
- Update `IMPROVEMENT-ROADMAP.md` with next step and residual risks.
- Finalize ADR changes (when applicable).
- Confirm PR checklist includes all ARCH governance items.

## Child Issues

- [x] ARCH-001 - Domain vs Application boundaries
  - Status: DONE
  - PR: `#31`
  - Merge SHA: `88787d7`
  - Notes: Added ADR-005 and baseline architecture guardrails/tracker.

- [x] ARCH-002 - Modularize monolithic `index.ts`
  - Status: DONE
  - PR: `#32`
  - Merge SHA: `4cad15d`
  - Notes: Split monolithic indexes into context modules across domain/application/api.

- [x] ARCH-003 - Schema-first validation with Zod
  - Status: DONE
  - Issue: `#30`
  - Branch: `chore/arch-003-schema-first-zod`
  - PR: `#34`
  - Merge SHA: `dc7404d`
  - Notes: Implemented schema-first boundary validation for subscription commands, checkout, and Stripe webhook parsing with canonical schemas in contracts.

- [x] ARCH-004 - Timezone-safe date/time strategy (Luxon)
  - Status: DONE
  - Issue: `#36`
  - Branch: `chore/arch-004-timezone-luxon-policy`
  - PR: `#37`
  - Merge SHA: `46e6804`
  - Notes: Strict ISO-8601 datetime with explicit timezone offset, Luxon shared utilities, and critical Date migration.

- [x] ARCH-005 - Standard error model + centralized API mapping
  - Status: DONE
  - Issue: `#39`
  - Branch: `chore/arch-005-error-model-api-mapper`
  - PR: `#40`
  - Merge SHA: `b72ef69484dc898cc90d3feef4411b9e8e1914d6`
  - Notes: AppError base + centralized mapper + auth/checkout/subscription adoption + Vitest coverage delivered.
  - Residual risks: Remaining modules outside safe slice still use legacy/local mapping and should migrate in ARCH-006.

- [x] ARCH-006 - Generic idempotency executor
  - Status: DONE
  - Issue: `#42`
  - Branch: `chore/arch-006-generic-idempotency-executor`
  - PR: `#43`
  - Merge SHA: `0706202f196d3c7969d39bc79e80a6e7d3cfe4aa`
  - Notes: Implemented generic async idempotency executor, migrated subscription and auth flows, and adopted key-based webhook dedup through shared foundation.
  - Residual risks: Payload-hash conflict detection for webhook flows remains intentionally out of scope in this stage.

- [x] ARCH-007 - i18n foundation (`en_US`)
  - Status: DONE
  - Issue: `#45`
  - Branch: `chore/arch-007-i18n-foundation`
  - PR: `#46`
  - Merge SHA: `64e2d3d3b43943459944b36dc52af2df039a5724`
  - Notes: Introduced i18n foundation with en-US baseline and API integration through shared translator.

- [x] ARCH-008 - Final hardening for idempotency states, shared dedupe, and style guideline
  - Status: DONE
  - Issue: `#50`
  - Branch: `chore/arch-008-final-hardening`
  - PR: `#49`
  - Merge SHA: `bef4fbc2eca25f136871109d09168293923f46ae`
  - Notes: Introduce stateful idempotency (`processing/completed/failed`), extract shared idempotency/error helpers, and formalize classes vs functions guideline.

- [x] ARCH-009 - Invoice idempotent use-case rollout (application + API + worker)
  - Status: DONE
  - Issue: `#52`
  - Branch: `chore/arch-009-invoice-idempotent-rollout`
  - PR: `#53`
  - Merge SHA: `591315941c9a0944cb353279ce651888462e2c6b`
  - Notes: Delivered async invoice enqueue/status API, application idempotent enqueue/process/status use-cases, worker processing loop, and full coverage across application/API/worker.
  - Residual risks: In-memory queue/idempotency storage is non-durable and must be replaced by persistent infrastructure in ARCH-010.


- [x] ARCH-010 - Invoice async infrastructure hardening (durable queue, retries, observability)
  - Status: DONE
  - Issue: `#55`
  - Branch: `chore/arch-010-invoice-infra-hardening`
  - PR: `#56`
  - Merge SHA: `487c7bf621cc8f657cd0911c0255c7a86007a577`
  - Notes: Replace in-memory invoice async infrastructure with durable queue/store, add retry/backoff + dead-letter strategy, and observability while preserving ARCH-009 public contracts.

- [x] ARCH-011 - Invoice async operational readiness (observability + replay controls)
  - Status: DONE
  - Issue: `#58`
  - Branch: `chore/arch-011-invoice-ops-readiness`
  - PR: `#59`
  - Merge SHA: `e58acbb87aba2eb334bf99d3f2d77d84c364434f`
  - Notes: Add operational observability, replay safeguards, and runbook-level guidance for async invoice flow without changing ARCH-009/010 API contracts.

- [x] ARCH-012 - Schema-first contracts, unified time policy, and boundary dedup polish
  - Status: DONE
  - Issue: `#61`
  - Branch: `chore/arch-012-schema-time-boundaries`
  - PR: `#65`
  - Merge SHA: `ea6db9a73ac59e7fa2575808ae45d6f10c1701fb`
  - Notes: Enforce schema-first contracts (Zod as source of truth), unify Luxon datetime policy, and remove duplicated boundary orchestration while preserving API behavior.

- [x] ARCH-018 - Schema-first boundaries and OpenAPI generation
  - Status: DONE
  - Issue: `#75`
  - Branch: `chore/arch-018-schema-boundaries`
  - PR: `#89`
  - Merge SHA: `4c384d0`
  - Notes: Hardened schema-first request boundaries, added OpenAPI generation/validation scripts, and versioned OpenAPI artifact checks. Follow-ups: `#92` migrated validation to Redocly and enriched generated OAS metadata; `#93` removed the legacy swagger-parser validator script.

- [x] ARCH-019 - Error model v2 and i18n-ready envelope
  - Status: DONE
  - Issue: `#76`
  - Branch: `chore/arch-019-error-model-v2-i18n-envelope`
  - PR: `#95`
  - Merge SHA: `e56fc1d`
  - Notes: Introduced Error Model v2 with `messageKey`/`messageParams`, preserved backward compatibility (`message` + `code`), added structured validation details (`details.issues[]`), and expanded en-US error catalog for critical paths.

- [x] ARCH-020 - Full operational observability baseline
  - Status: DONE
  - Issue: `#77`
  - Branch: `chore/arch-020-observability-baseline`
  - PR: `#97`
  - Merge SHA: `6f1f833`
  - Notes: Delivered observability baseline with structured logs, worker-cycle metrics/latency events, and coverage for observability behavior.

- [x] ARCH-021 - CI/CD quality and security gates
  - Status: DONE
  - Issue: `#78`
  - Branch: `chore/arch-021-ci-security-gates`
  - PR: `#90`
  - Merge SHA: `b007968`
  - Notes: Added CI quality/security workflows, enforced OpenAPI drift checks, enabled Postgres integration gates, and aligned main branch protection with required checks.

- [ ] ARCH-022 - Performance, resilience, and readiness finalization
  - Status: IN_PROGRESS
  - Issue: `#79`
  - Branch: `chore/arch-022-readiness-finalization`
  - PR: `TBD`
  - Merge SHA: `TBD`
  - Notes: Started ARCH-022 to consolidate SLI/SLO targets, alert/runbook baseline, and production-readiness hardening.

## ADR References

- [x] ADR-005 - Domain vs Application boundary
- [x] ADR-006 - Validation strategy (schema-first, accepted)
- [x] ADR-007 - Date/time and timezone policy (accepted)
- [x] ADR-008 - Error and response standardization (accepted)
- [x] ADR-009 - Generic idempotency strategy (accepted)
- [x] ADR-010 - i18n foundation with `en_US` baseline (accepted)
- [x] ADR-011 - Idempotency state machine and concurrency strategy (accepted)
- [x] ADR-012 - Classes vs functions guideline (accepted)
- [x] ADR-013 - Async idempotent invoice rollout (accepted)
- [x] ADR-014 - Durable invoice async infrastructure (accepted)
- [x] ADR-016 - Schema-first contracts, time policy, and boundary polish (accepted)

## Quality Gates (mandatory per PR)

- [ ] `npm run quality:gate`
- [ ] `DATABASE_URL=postgresql://grantledger:grantledger@localhost:5432/grantledger RUN_PG_TESTS=1 npm run test:pg` (or CI evidence)
- [ ] `Architectural scope respected (no mixed feature work)`

## Done Criteria for ARCH-000

- [ ] All child issues completed and merged
- [ ] ADRs updated with final architectural decisions
- [ ] Quality gates passed for every child PR
- [ ] Tracker fully updated with issue/PR links
