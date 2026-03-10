# Security Operations

GrantLedger treats security checks as part of the delivery path, not as a separate afterthought.

## What is enforced in CI

- `Dependency Audit`
  - blocks the workflow on production dependency vulnerabilities at `high` severity or above
- `CodeQL`
  - scans the TypeScript codebase for code-level security issues
- `Container Scan`
  - scans the API and worker images for `high` and `critical` vulnerabilities
- `SBOM`
  - generates SPDX JSON artefacts for the API and worker images

## Triage expectations

- `critical`
  - treat as blocking by default
  - fix before merge unless a documented and time-bound exception is approved
- `high`
  - treat as blocking for internet-facing runtime paths and build images
  - otherwise, document mitigation or open a follow-up issue before merge
- `medium` and below
  - review in context and track intentionally

## Dependency update policy

- Dependabot is enabled for:
  - npm dependencies
  - GitHub Actions workflows
  - API and worker Docker base images
- Keep update PRs small and grouped by ecosystem
- Review changelogs and release notes before merge when updates affect:
  - runtime frameworks
  - observability
  - Docker base images
  - security tooling

## Secret handling rules

- Never commit real secret values
- Use `.env.example` and deployment examples for placeholders only
- Runtime configuration errors must not echo secret values or connection strings
- Structured logs must redact sensitive payload keys by default
- Demo and smoke scripts must avoid printing credentials

## CI blocking policy

- blocking:
  - quality gate
  - Postgres integration
  - dependency audit
  - CodeQL
  - container image scan
- non-blocking but required as artefacts:
  - SBOM generation

## Security artefacts

- SBOM artefacts are generated in CI for:
  - API image
  - worker image
- Keep generated artefacts attached to workflow runs rather than committed to the repository

## Operational follow-up

When a security finding is accepted temporarily:

1. document the reason
2. capture scope and mitigation
3. create a dated follow-up issue
4. avoid leaving silent, indefinite exceptions
