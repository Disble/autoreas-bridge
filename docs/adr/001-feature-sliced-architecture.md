# ADR 001: Feature-Sliced Architecture and Strict Colocation

## Status
Accepted

## Context
The bridge frontend started as a small Wails MVP, but even a small React surface drifts fast when components mix rendering, Wails bindings, and view orchestration in the same file. We need the same architecture rails already proven in `autoreas-mobile`, adapted to the bridge runtime.

## Decision
We adopt a **Feature-Sliced** organization for the bridge frontend.
1. Frontend business concepts live under `frontend/src/features/`.
2. Every complex UI module must be self-contained with `index.ts`, `.tsx`, `use-*.ts`, `*.types.ts`, `*.constants.ts`, `*.helpers.ts`, optional `*.schema.ts`, and colocated `__tests__/`.
3. `frontend/src/App.tsx` and any future `frontend/src/app/**` files are delivery-only composition layers.

## Consequences
* **Positive:** higher cohesion, easier TDD, predictable AI edits, cleaner separation between Wails delivery and feature logic.
* **Negative:** more files and stronger upfront structure discipline.
