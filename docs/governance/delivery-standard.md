# Delivery Standard

## Branching
- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`

## Rules
- 1 issue = 1 branch = 1 PR
- No direct commits to `main`
- Keep PR scope small and aligned with one issue
- Use Squash and Merge

## Required Gates (local and CI)
- `npm run quality:gate`
- `DATABASE_URL=postgresql://grantledger:grantledger@localhost:5432/grantledger npm run test:pg` (CI mandatory)
- Security workflow should be green or explicitly triaged in PR risks.

## Branch Protection Baseline
- Protect `main` and require CI checks:
- `Quality Gate`
- `Postgres Integration`
- Keep security checks visible and actionable; move to blocking after baseline stabilization.

## PR Quality
- Include Summary, Why, Scope, Validation, Risks
- Document trade-offs explicitly
- Update ADR when a decision has long-term architectural impact
