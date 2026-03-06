# GrantLedger Platform

[![CI](https://github.com/gabedalmolin/grantledger-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gabedalmolin/grantledger-platform/actions/workflows/ci.yml)

GrantLedger is a multi-tenant SaaS billing platform built to make change-safe billing workflows easier to reason about, validate, and evolve.

It focuses on the parts of billing systems that usually become brittle first: idempotent writes, webhook replay handling, asynchronous invoice processing, explicit boundary contracts, and architectural discipline across transport, application, and domain layers.

## Quick Start

### Prerequisites

- Node.js `>=22 <23`
- npm `>=10 <11`
- Docker (for Postgres validation)

### Install dependencies

```bash
npm ci
```

### Fast local confidence loop

```bash
npm run typecheck
npm run build
npm run test
```

### Full project gate

```bash
npm run quality:gate
```

### Durable Postgres validation

```bash
npm run db:up
DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' npm run db:migrate
DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' npm run test:pg
```

If your local `grantledger-postgres` volume already exists, recreate it once so that initialisation scripts from `db/init` are applied cleanly.

## Why This Project Exists

Billing rarely stays simple for long.

What begins as a handful of rules usually grows into retries, replay handling, partial failures, timezone-sensitive periods, and business logic spread across handlers, jobs, and external integrations.

GrantLedger exists to model that reality directly. The goal is not to showcase architecture for its own sake. The goal is to provide a practical foundation for SaaS billing flows that remain:

- reliable under retries and concurrency;
- explicit at the boundaries;
- auditable when something goes wrong;
- maintainable as the product and team grow.

## Project Objective

GrantLedger aims to give product and engineering teams confidence that billing behaviour is:

- consistent;
- auditable;
- resilient under retries and concurrency;
- understandable under operational stress;
- evolvable without losing architectural coherence.

## At a Glance

> Current state on `main`: architecture hardening baseline is complete through `ARCH-024`, and API runtime wiring is now modularised across `subscription`, `invoice`, and `webhook` bootstrap paths.

- domain rules remain pure and deterministic;
- application use cases orchestrate idempotency, retries, replay, and audit flow;
- API and worker layers adapt transport concerns without leaking business logic;
- contracts are schema-first at the boundaries;
- Postgres-backed durable paths are validated separately through dedicated integration checks;
- architecture changes are tracked through ADRs and `ARCH-*` delivery streams.

## What Is Implemented Today

### Core capabilities

- Tenant-aware request context resolution with explicit authentication and access failure semantics.
- Checkout orchestration through an application-level payment provider contract.
- Subscription state-machine commands with idempotent mutation orchestration.
- Webhook normalisation and deduplication with canonical event publishing contracts.
- Schema-first invoice API contracts with Zod-inferred types to reduce contract drift.
- Unified datetime policy (Luxon-based) across invoice orchestration paths.
- Boundary-level payload normalisation to reduce duplication and preserve API consistency.
- Replay controls and observer-based operational hooks for async invoice lifecycle monitoring.
- Asynchronous invoice generation flow across API, application, worker, and durable Postgres infrastructure:
  - enqueue with `Idempotency-Key`
  - poll status by `jobId`
  - process work with retry scheduling and terminal dead-letter behaviour

### Behavioural guarantees

- Standard API error envelope: `{ message, code, details?, traceId? }`
- Application-layer idempotency state model: `processing | completed | failed`
- Conflict safety:
  - same key + different payload -> `409`
  - same key while processing -> `409`
- Async invoice contract:
  - enqueue -> `202 Accepted` with `jobId`
  - status -> `queued | processing | completed | failed`
  - transient processing failures can return the job to `queued` with retry context

## Architecture

### Layer responsibilities

- `packages/domain`
  - entities, invariants, state transitions, deterministic calculations
  - no transport, framework, or provider concerns
- `packages/application`
  - use-case orchestration, ports/interfaces, idempotency, retry, replay, and audit flow
  - no HTTP-specific mapping
- `apps/api`
  - boundary validation, header/context resolution, runtime composition, and transport mapping
- `apps/worker`
  - worker loop orchestration and operational execution of asynchronous flows
- `packages/contracts`
  - canonical types and Zod schemas for boundary contracts
- `packages/shared`
  - reusable cross-cutting helpers such as time handling, i18n, observability helpers, and idempotency utilities
- `packages/infra-postgres`
  - durable repositories, job stores, webhook persistence, and tenant-scoped infrastructure wiring

### API runtime composition

The API layer now follows a clearer separation of concerns:

- `handlers/`
  - transport-facing behaviour only
- `bootstrap/`
  - runtime assembly and environment-specific dependency wiring
- `http/`
  - transport primitives and shared HTTP mapping helpers

This keeps HTTP handlers focused on request/response concerns while moving infrastructure selection into dedicated bootstrap modules.

### Dependency direction

`apps/* -> application -> domain`

`contracts`, `shared`, and infrastructure adapters remain foundational packages consumed by the higher layers.

### Repository layout

```txt
apps/
  api/
    src/
      bootstrap/
      handlers/
      http/
      infrastructure/
  worker/
  admin/

packages/
  application/
  contracts/
  domain/
  infra-postgres/
  shared/

docs/
  adr/
  architecture/
  governance/
```

## Async Invoice Flow

```mermaid
flowchart LR
  C["Client"] -->|POST enqueue + Idempotency-Key| API["API handler"]
  API --> APP1["application.enqueueInvoiceGeneration"]
  APP1 --> JOB["JobStore (queued)"]
  C -->|GET status jobId| API
  W["Worker runInvoiceWorkerOnce"] --> APP2["application.processNextInvoiceGenerationJob"]
  APP2 --> JOB
  APP2 --> INV["InvoiceRepository"]
  APP2 --> AUD["AuditLogger / Observer hooks"]
  JOB -->|completed / failed| API
```

## Monorepo Packages

- `@grantledger/domain`
  - business rules and invariants
- `@grantledger/application`
  - use cases such as `subscription`, `invoice`, `idempotency`, `payment-webhook`, `auth-context`, and `checkout`
- `@grantledger/contracts`
  - shared contracts and Zod schemas across domain, application, and API boundaries
- `@grantledger/shared`
  - time policy, i18n baseline, observability helpers, payload hashing, and standard error helpers
- `@grantledger/infra-postgres`
  - durable persistence and Postgres-specific runtime wiring
- `@grantledger/api` / `@grantledger/worker`
  - transport-facing orchestration adapters built as testable functions

## Tech Stack

- Node.js `22.x`
- TypeScript (`strict`, project references, `exactOptionalPropertyTypes`)
- npm workspaces
- Zod for schema-first boundary validation
- Luxon for timezone-safe datetime handling
- Vitest for test execution
- ESLint for static analysis
- GitHub Actions for CI and security automation

## Testing Strategy

Testing is intentionally split by feedback speed and risk profile.

### Default suite

- `npm run test`
  - fast default validation across application, API, and worker behaviour
- `npm run test:coverage`
  - default coverage-oriented run for the same fast suite

### Durable infrastructure suite

- `npm run test:pg`
  - dedicated Postgres integration validation for durable persistence paths in `packages/infra-postgres`

### Why the split exists

This split is deliberate:

- local iteration stays fast;
- durable persistence behaviour is still validated explicitly;
- CI can enforce both fast feedback and infrastructure realism without forcing every local run through Postgres.

Current test scope prioritises business-critical behaviour:

- `packages/application/src/**/*.test.ts`
  - idempotency core
  - subscription idempotency
  - webhook deduplication
  - invoice enqueue/process idempotency and retry lifecycle
- `apps/api/src/**/*.test.ts`
  - integration-style handler tests for auth, checkout, subscription, invoice, webhook, and error mapping
- `apps/worker/src/**/*.test.ts`
  - worker loop behaviour such as `idle`, `processed`, retry scheduling, dead-letter handling, and observer-failure resilience
- `packages/infra-postgres/src/**/*.integration.test.ts`
  - durable persistence, tenant isolation, invoice jobs, idempotency state, and webhook storage

## Common Developer Workflows

### Fast validation before a small change

```bash
npm run typecheck
npm run build
npm run test
```

### Full validation before opening or updating a PR

```bash
npm run quality:gate
DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' npm run test:pg
```

### Delivery bootstrap

Use the orchestrator when opening or updating delivery PRs with issue/project metadata sync.

```bash
DATABASE_URL='postgresql://grantledger_app:grantledger_app@localhost:5432/grantledger_rls' \
bash ./scripts/delivery-bootstrap.sh \
  --issue-number <ISSUE_NUMBER> \
  --issue-body /tmp/issue.md \
  --pr-title "<PR_TITLE>" \
  --pr-body /tmp/pr.md \
  --branch <BRANCH_NAME>
```

Add `--skip-gates` only when the relevant checks were already executed on the same branch and commit.

### Delivery closeout

Use the closeout orchestrator after checks pass to synchronise PR, issue, and project completion.

```bash
bash ./scripts/delivery-closeout.sh --pr <PR_NUMBER>
```

Use `--issue <ISSUE_NUMBER>` when the PR body does not contain `Closes #N`.

## Governance and Architecture Discipline

Architecture changes follow an issue-driven stream (`ARCH-*`) with mandatory documentation updates.

- Tracker: `docs/architecture/ARCH-TRACKER.md`
- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Roadmap: `docs/architecture/IMPROVEMENT-ROADMAP.md`
- Health check: `docs/governance/architecture-health-check.md`
- Contribution guideline: `CONTRIBUTING.md`
- PR checklist: `.github/pull_request_template.md`

### Accepted ADRs

- `ADR-005` Domain vs Application boundary
- `ADR-006` Schema-first validation with Zod
- `ADR-007` Timezone-safe datetime policy (Luxon)
- `ADR-008` Standard error model and centralised API mapping
- `ADR-009` Generic idempotency executor
- `ADR-010` i18n foundation (`en-US` baseline)
- `ADR-011` Idempotency state machine and concurrency behaviour
- `ADR-012` Classes vs functions guideline
- `ADR-013` Async idempotent invoice rollout
- `ADR-014` Durable invoice async infrastructure strategy
- `ADR-015` Invoice async operational readiness
- `ADR-016` Schema-first contracts, unified time policy, and boundary deduplication polish

## Current Trade-offs and Next Steps

- Deterministic in-memory adapters are still used in selected paths for simplicity and fast local feedback.
- Durable Postgres-backed behaviour is already modelled and validated for the infrastructure paths that matter most.
- The next architectural move should be driven by a concrete structural risk, not change for change's sake.

## Project Links

- Repository: [gabedalmolin/grantledger-platform](https://github.com/gabedalmolin/grantledger-platform)
- Project board: [GitHub Project #6](https://github.com/users/john-dalmolin/projects/6)

## Acknowledgments

Special thanks to [Marcos Pont](https://github.com/marcospont) for all the support, advice, and feedback throughout this project.
His guidance was fundamental to shaping and improving GrantLedger.

## References

- HTTP Semantics (RFC 9110): [https://www.rfc-editor.org/rfc/rfc9110](https://www.rfc-editor.org/rfc/rfc9110)
- Zod documentation: [https://zod.dev](https://zod.dev)
- Luxon documentation: [https://moment.github.io/luxon](https://moment.github.io/luxon)
