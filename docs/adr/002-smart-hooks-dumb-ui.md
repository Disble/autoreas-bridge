# ADR 002: Smart Hooks, Dumb UI, and Strict Hook Anatomy

## Status
Accepted

## Context
Bridge frontend files currently mix Wails calls, `useEffect`, rendering, and view-only concerns. That makes tests brittle and encourages dumping logic into `.tsx` files.

## Decision
We enforce **smart hooks + dumb UI** in `frontend/src/features/`.
1. `.tsx` files render only HeroUI React primitives and Tailwind classes.
2. Wails bindings, effects, and orchestration live in `use-*.ts` files.
3. Hooks follow the strict order: imports, signature, refs, state, context/3rd party hooks, queries/mutations, derived state, callbacks, effects, return.

## Consequences
* **Positive:** testable logic, smaller render files, easier refactors, less architectural drift.
* **Negative:** initial ceremony when extracting small components into feature modules.
