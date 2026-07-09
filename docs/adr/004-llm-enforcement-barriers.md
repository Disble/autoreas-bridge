# ADR 004: LLM Enforcement Barriers

## Status
Accepted

## Context
Documented conventions are not enough when humans and agents both modify the frontend. We need mechanical barriers that fail fast when someone dumps logic into a delivery file or creates monolithic feature code.

## Decision
We enforce the frontend architecture with multiple barriers:
1. ESLint rules for max-lines, delivery purity, strict colocation, readonly props, and helper JSDoc.
2. Fallow for dead code, dependency hygiene, duplication, and changed-code audit pressure.
3. Generator-based scaffolding for complex feature folders.
4. Repeated instruction blocks in `AGENTS.md` and `CLAUDE.md`.

## Consequences
* **Positive:** architectural intent becomes executable and verifiable.
* **Negative:** ESLint and scaffolding maintenance become part of the platform burden.
