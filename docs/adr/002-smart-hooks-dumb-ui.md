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
4. When several hooks render the same backend runtime process, they consume a shared read-model store from `frontend/src/shared/store/` rather than each hook owning an independent snapshot and event subscription.

## Consequences
* **Positive:** testable logic, smaller render files, easier refactors, less architectural drift.
* **Positive:** shared runtime state has one invalidation path, reducing stale UI bugs between sibling panels.
* **Negative:** initial ceremony when extracting small components into feature modules.
