# Architecture Health Check (Monthly)

## Purpose
Keep architecture baselines healthy after ARCH-023 without unnecessary process overhead.

## Cadence
- Monthly review (or after major incident)

## Checklist
1. CI/security/OpenAPI gates still green and enforced
2. Error model and schema-first boundaries unchanged
3. Runtime fail-fast guards still active
4. Observability signals (latency/failure/queue depth) stable
5. Decide: open new ARCH issue only if a concrete structural risk exists

## Output
- Short decision note in a GitHub issue:
  - no action required, or
  - create a new ARCH-* issue with scope and risk justification
