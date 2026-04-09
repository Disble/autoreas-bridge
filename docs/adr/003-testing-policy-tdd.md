# ADR 003: Testing Policy, TDD Powered by SDD

## Status
Accepted

## Context
The bridge repo already runs strict TDD in `openspec/config.yaml`. The frontend needs the same explicit policy so helpers and hooks do not become untested glue code.

## Decision
Frontend work follows **SDD + TDD**.
1. Read the relevant spec first.
2. For frontend helpers/hooks, write or update the colocated failing test first.
3. Implement the minimal code to go green.
4. Refactor while preserving the architecture rails.

Coverage expectations:
* `*.helpers.ts` and `*.schema.ts`: very high confidence / effectively full behavior coverage.
* `use-*.ts`: behavior-focused integration coverage.
* `.tsx`: test behavior and conditional rendering, not style trivia.

## Consequences
* **Positive:** safer refactors, better AI guardrails, faster regression detection.
* **Negative:** more upfront effort for small changes.
