# ARCH-000 Tracker - Architecture Hardening

## Objective

Track architecture hardening as a deliberate delivery stream, preserve an auditable record of structural decisions, and keep governance documents aligned with the actual platform baseline.

## Canonical References

- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Roadmap: `docs/architecture/IMPROVEMENT-ROADMAP.md`
- Boundary ADR: `docs/adr/ADR-005-domain-vs-application-boundary.md`
- Architecture health check: `docs/governance/architecture-health-check.md`

## Baseline Summary

The ARCH hardening baseline is complete through `ARCH-033`.

That baseline now includes:

- clear domain vs application boundaries;
- schema-first contracts and OpenAPI generation;
- timezone-safe datetime handling and standardised error mapping;
- generic idempotency orchestration and durable webhook/invoice persistence;
- executable API and worker runtimes with health, readiness, and metrics;
- self-hosted deployment validation and guided demo coverage;
- supply-chain and container security automation.

## Scope

The ARCH stream covered the following structural concerns:

- define and enforce Domain vs Application boundaries;
- modularise monolithic package surfaces and hotspots;
- adopt schema-first validation with Zod;
- standardise date/time strategy with timezone support;
- standardise exception-to-API response mapping;
- introduce generic idempotency execution and state management;
- introduce i18n and shared platform foundations;
- roll out async idempotent invoice orchestration across API, application, worker, and Postgres infrastructure;
- harden bootstrap, runtime, observability, self-hosted deployment, and supply-chain baselines.

## Out of Scope

- unrelated business feature expansion;
- UI/admin product work;
- cloud-vendor-specific deployment strategy before the self-hosted baseline.

## Execution Strategy

- Keep architecture changes incremental and reviewable.
- Preserve a stable public surface while improving internal structure.
- Open a new ARCH issue only when there is a concrete structural risk or leverage opportunity.
- Keep governance artefacts synchronized with delivered code, not aspirational state.

## Child Issues

- [x] ARCH-001 - Domain vs Application boundaries
  - Status: DONE
  - PR: `#31`
  - Merge SHA: `88787d7`
  - Notes: Added ADR-005 and baseline architecture guardrails/tracker.

- [x] ARCH-002 - Modularise monolithic `index.ts`
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

- [x] ARCH-005 - Standard error model + centralised API mapping
  - Status: DONE
  - Issue: `#39`
  - Branch: `chore/arch-005-error-model-api-mapper`
  - PR: `#40`
  - Merge SHA: `b72ef69484dc898cc90d3feef4411b9e8e1914d6`
  - Notes: AppError base + centralised mapper + auth/checkout/subscription adoption + Vitest coverage delivered.
  - Residual risks: Remaining modules outside the initial slice migrated later in the ARCH stream.

- [x] ARCH-006 - Generic idempotency executor
  - Status: DONE
  - Issue: `#42`
  - Branch: `chore/arch-006-generic-idempotency-executor`
  - PR: `#43`
  - Merge SHA: `0706202f196d3c7969d39bc79e80a6e7d3cfe4aa`
  - Notes: Implemented generic async idempotency executor, migrated subscription/auth flows, and adopted key-based webhook dedupe through shared foundations.

- [x] ARCH-007 - i18n foundation (`en_US`)
  - Status: DONE
  - Issue: `#45`
  - Branch: `chore/arch-007-i18n-foundation`
  - PR: `#46`
  - Merge SHA: `64e2d3d3b43943459944b36dc52af2df039a5724`
  - Notes: Introduced i18n foundation with en-US baseline and API integration through shared translation helpers.

- [x] ARCH-008 - Final hardening for idempotency states, shared dedupe, and style guidance
  - Status: DONE
  - Issue: `#50`
  - Branch: `chore/arch-008-final-hardening`
  - PR: `#49`
  - Merge SHA: `bef4fbc2eca25f136871109d09168293923f46ae`
  - Notes: Introduced stateful idempotency, extracted shared helpers, and formalised classes vs functions guidance.

- [x] ARCH-009 - Invoice idempotent use-case rollout (application + API + worker)
  - Status: DONE
  - Issue: `#52`
  - Branch: `chore/arch-009-invoice-idempotent-rollout`
  - PR: `#53`
  - Merge SHA: `591315941c9a0944cb353279ce651888462e2c6b`
  - Notes: Delivered async invoice enqueue/status API, application idempotent enqueue/process/status use-cases, worker processing loop, and coverage across application/API/worker.

- [x] ARCH-010 - Invoice async infrastructure hardening (durable queue, retries, observability)
  - Status: DONE
  - Issue: `#55`
  - Branch: `chore/arch-010-invoice-infra-hardening`
  - PR: `#56`
  - Merge SHA: `487c7bf621cc8f657cd0911c0255c7a86007a577`
  - Notes: Replaced in-memory invoice async infrastructure with durable queue/store, retry/backoff, dead-letter handling, and observability.

- [x] ARCH-011 - Invoice async operational readiness (observability + replay controls)
  - Status: DONE
  - Issue: `#58`
  - Branch: `chore/arch-011-invoice-ops-readiness`
  - PR: `#59`
  - Merge SHA: `e58acbb87aba2eb334bf99d3f2d77d84c364434f`
  - Notes: Added operational observability, replay safeguards, and runbook-level guidance for async invoice flow.

- [x] ARCH-012 - Schema-first contracts, unified time policy, and boundary dedup polish
  - Status: DONE
  - Issue: `#61`
  - Branch: `chore/arch-012-schema-time-boundaries`
  - PR: `#65`
  - Merge SHA: `ea6db9a73ac59e7fa2575808ae45d6f10c1701fb`
  - Notes: Enforced schema-first contracts, unified Luxon datetime policy, and removed duplicated boundary orchestration while preserving API behaviour.

- [x] ARCH-018 - Schema-first boundaries and OpenAPI generation
  - Status: DONE
  - Issue: `#75`
  - Branch: `chore/arch-018-schema-boundaries`
  - PR: `#89`
  - Merge SHA: `4c384d0`
  - Notes: Hardened schema-first request boundaries, added OpenAPI generation/validation scripts, and versioned OpenAPI artefact checks.

- [x] ARCH-019 - Error model v2 and i18n-ready envelope
  - Status: DONE
  - Issue: `#76`
  - Branch: `chore/arch-019-error-model-v2-i18n-envelope`
  - PR: `#95`
  - Merge SHA: `e56fc1d`
  - Notes: Introduced Error Model v2 with `messageKey`/`messageParams`, preserved backward compatibility, and expanded structured validation detail coverage.

- [x] ARCH-020 - Full operational observability baseline
  - Status: DONE
  - Issue: `#77`
  - Branch: `chore/arch-020-observability-baseline`
  - PR: `#97`
  - Merge SHA: `6f1f833`
  - Notes: Delivered structured logs, worker-cycle metrics, latency events, and observability behaviour coverage.

- [x] ARCH-021 - CI/CD quality and security gates
  - Status: DONE
  - Issue: `#78`
  - Branch: `chore/arch-021-ci-security-gates`
  - PR: `#90`
  - Merge SHA: `b007968`
  - Notes: Added CI quality/security workflows, enforced OpenAPI drift checks, enabled Postgres integration gates, and aligned branch protection expectations.

- [x] ARCH-022 - Performance, resilience, and readiness finalisation
  - Status: DONE
  - Issue: `#79`
  - Branch: `chore/arch-022-readiness-finalization`
  - PR: `#99`
  - Merge SHA: `fb43b20`
  - Notes: Finalised readiness baseline with SLI/SLO targets, alert/runbook guidance, and API startup fail-fast validation.

- [x] ARCH-023 - Postgres persistence regression coverage hardening
  - Status: DONE
  - Issue: `#114`
  - Branch: `feat/arch-023-pg-persistence-regression-tests`
  - PR: `#115`
  - Merge SHA: `e7495526b79c558cead94e05d052c8fb694f79a6`
  - Notes: Added Postgres integration regression coverage for idempotency begin/replay/conflict/restart flows, invoice job lease/retry/dead-letter guards, and tenant-scoped persistence safety.

- [x] ARCH-024 - Durable webhook idempotency and audit persistence
  - Status: DONE
  - Issue: `#121`
  - Branch: `feat/arch-024-webhook-durable-persistence`
  - PR: `#122`
  - Merge SHA: `8b77832143d1a400f50112a1bb9d95c7963bfe25`
  - Notes: Replaced process-local webhook dedupe with durable Postgres-backed idempotency state, persisted webhook audit rows, and hardened migration/test startup behaviour.

- [x] ARCH-025 - Harden bootstrap and boundary coverage
  - Status: DONE
  - Issue: `#142`
  - Branch: `test/arch-025-bootstrap-boundary-coverage`
  - PR: `#146`
  - Merge SHA: `5bd8c975f7d988eee176b69b54e016346468aa9b`
  - Notes: Strengthened bootstrap, domain, and contract boundary coverage to make architectural seams safer to refactor.

- [x] ARCH-026 - Decompose invoice application orchestration
  - Status: DONE
  - Issue: `#143`
  - Branch: `refactor/arch-026-invoice-application-decomposition`
  - PR: `#147`
  - Merge SHA: `29c4086f402bba179ffa8f306df1b250399201cf`
  - Notes: Split the invoice orchestration hotspot into smaller cohesive modules while preserving the public application surface.

- [x] ARCH-027 - Improve workspace DX and remove build-artefact coupling
  - Status: DONE
  - Issue: `#144`
  - Branch: `chore/arch-027-workspace-dx-build-artifacts`
  - PR: `#148`
  - Merge SHA: `579db197b092288eee8e88bc7a93c52242f78fbe`
  - Notes: Improved workspace test ergonomics, source-based OpenAPI generation, and removed unnecessary reliance on built artefacts.

- [x] ARCH-028 - Establish deployable runtime baseline for API and worker
  - Status: DONE
  - Issue: `#145`
  - Branch: `chore/arch-028-runtime-baseline`
  - PR: `#149`
  - Merge SHA: `2303ccdebd6c2da11f7e2323be80f1a4196651c2`
  - Notes: Added executable API and worker entrypoints, Dockerfiles, health/readiness endpoints, and production-like runtime validation.

- [x] ARCH-029 - Harden runtime security and environment contracts
  - Status: DONE
  - Issue: `#150`
  - Branch: `chore/arch-029-runtime-security-env-contracts`
  - PR: `#155`
  - Merge SHA: `3524fa59b9f1172a0b5cd4dee3a51005c551236e`
  - Notes: Added explicit runtime config validation, safer API request handling, non-root containers, and documented environment contracts.

- [x] ARCH-030 - Add runtime metrics and operational observability stack
  - Status: DONE
  - Issue: `#151`
  - Branch: `feat/arch-030-runtime-metrics-observability`
  - PR: `#156`
  - Merge SHA: `ad79c6bf141343fef60df5c28a3aefefd222f471`
  - Notes: Added Prometheus-style API/worker metrics, structured log metadata, and committed Prometheus/Grafana observability assets.

- [x] ARCH-031 - Add self-hosted deployment baseline and stack smoke validation
  - Status: DONE
  - Issue: `#152`
  - Branch: `chore/arch-031-self-hosted-deployment-baseline`
  - PR: `#157`
  - Merge SHA: `50f780fc9528f301eb998966e241de90a94c3e92`
  - Notes: Added a production-like self-hosted compose stack, health checks, smoke validation, and CI Docker image build coverage.

- [x] ARCH-032 - Add guided demo scenario and seeded billing walkthrough
  - Status: DONE
  - Issue: `#153`
  - Branch: `feat/arch-032-guided-demo-billing-flow`
  - PR: `#158`
  - Merge SHA: `d01d1ee6a81de1f73a5b90a959bb57fce2e81ffb`
  - Notes: Added a reproducible demo seed path, self-hosted walkthrough, and operator-friendly demo documentation.

- [x] ARCH-033 - Harden supply-chain and container security baseline
  - Status: DONE
  - Issue: `#154`
  - Branch: `chore/arch-033-supply-chain-container-security`
  - PR: `#159`
  - Merge SHA: `5fad62e446d58802ce80837ef9fe530302856906`
  - Notes: Added container scanning, SBOM generation, Dependabot automation, and security operations guidance while tightening runtime secret handling.

## Post-Baseline Backlog

- [ ] ARCH-035 - Decompose API server runtime and HTTP host boundary
  - Status: PLANNED
  - Issue: `#174`
  - Notes: Reduce the next runtime hotspot in `apps/api/src/server.ts` without changing public billing behaviour.

- [ ] ARCH-036 - Decompose idempotency and subscription orchestration
  - Status: PLANNED
  - Issue: `#175`
  - Notes: Reduce structural risk in the application layer by decomposing the next two core hotspots.

- [ ] ARCH-037 - Deepen billing catalog, plan-version, and entitlement realism
  - Status: PLANNED
  - Issue: `#176`
  - Notes: Increase product realism after the current structural/documentation refresh is complete.

## ADR References

- [x] ADR-005 - Domain vs Application boundary
- [x] ADR-006 - Validation strategy (schema-first)
- [x] ADR-007 - Date/time and timezone policy
- [x] ADR-008 - Error and response standardisation
- [x] ADR-009 - Generic idempotency strategy
- [x] ADR-010 - i18n foundation with `en_US` baseline
- [x] ADR-011 - Idempotency state machine and concurrency strategy
- [x] ADR-012 - Classes vs functions guideline
- [x] ADR-013 - Async idempotent invoice rollout
- [x] ADR-014 - Durable invoice async infrastructure
- [x] ADR-015 - Invoice async operational readiness
- [x] ADR-016 - Schema-first contracts, time policy, and boundary polish

## Quality Gates (mandatory per PR)

- [x] `npm run quality:gate`
- [x] `DATABASE_URL=postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls npm run test:pg` (or CI evidence)
- [x] Architectural scope respected (no mixed feature work)

## Done Criteria for ARCH-000 Baseline

- [x] Child issues completed and merged through `ARCH-033`
- [x] ADRs updated for accepted architectural decisions
- [x] Quality/security gates enforced across the stream
- [x] Tracker updated to the completed baseline
