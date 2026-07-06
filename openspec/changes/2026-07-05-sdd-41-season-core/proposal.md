# Proposal — sdd-41-season-core

## Intent

Establish the `internal/season` bounded context and the Season Workspace shell:
the foundation every later season-selection slice (SDD-42…46) builds on.

## Scope

- New hexagonal bounded context `internal/season` (+ `internal/season/domain`):
  the `Season` aggregate, the pure Excel-parity `Decision` derivation, a
  `Repository` port and its SQLite adapter, and the application `Service`.
- Lifecycle model: `open → closed` with repeatable milestone timestamps
  (`selection_confirmed_at`, `applied_at`, `closed_at`) — NOT a phase FSM
  (workspace model; see program design §1.3).
- Parameters: `min_approval_grade` (nota mínima de aprobación, default 4) and
  `slots` (default 12), both per-season editable.
- Schema: `seasons` + `season_animes` tables via the SDD-34 schema registry
  (`season_animes` created now, populated by later slices). Partial unique
  index enforces the single-open-season invariant.
- Wails bindings `app_season.go` (nil-safe) + `season_changed` realtime
  broadcast.
- Frontend: `season-source.ts`, `season-store.ts`, and the `/season` Season
  Workspace route (Overview + section-tab shell; create/close a season).

## Out of scope

- Intake/matching, availability, evaluation, selection, ordering (their own
  slices). Section tabs render an "upcoming" placeholder.
- `nota_pos_estreno` capture (dormant column only; descoped program-wide).

## Reference

Full plan: `openspec/changes/2026-07-05-sdd-39-season-selection-program/slices/sdd-41-season-core.md`.
