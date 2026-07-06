# SDD-41 — season-core

> Slice of program SDD-39. The foundation: `internal/season` bounded context,
> schema, lifecycle + milestones, decision derivation, bindings, and the
> Season Workspace shell. Every later slice hangs off this one.

## Objective

A persisted `Season` aggregate with its evaluation registry, reachable from a
new `/season` route — the **Season Workspace** where all sections live
side-by-side while the season is open.

## Model: workspace + milestones, NOT a phase wizard (user decision)

The original design proposed a linear FSM (intake→evaluating→selecting→…)
with guarded forward/backward transitions. The user rejected it, correctly:
in an append-only, soft-delete world, "going back a phase" is fiction —
created animes can't be uncreated, grades can't be ungiven. And the sections
aren't sequential in practice: the intake/daily board is used EVERY day to
stage the day's batch; evaluation is mobile's sibling module; selection
doesn't care whether grading is complete until the final deck is confirmed.

**What actually matters** (user's words): only `applied` (the schedule
written to real animes) and `closed` fundamentally affect normal mode.

So the model is:

- **Lifecycle**: `open → closed`. One active (open) season at a time
  (partial unique index). `closed` is terminal.
- **Milestones** (timestamps + repeatable actions, not states):
  - `selection_confirmed_at` — ConfirmSelection ran (bidirectional
    reconciler, SDD-45; re-runnable while open).
  - `applied_at` — ApplySchedule ran (SDD-46). While set, the ordering
    section renders read-only; "Reopen ordering" clears it (corrections are
    diff-based re-applies, cheap and idempotent — user-confirmed).
  - `closed_at` — CloseSeason. After this the registry is read-only history.
- **No gates between sections.** Everything is live while open. Where the old
  design had guards, actions now emit **warnings in their confirmation
  dialogs** instead (e.g. ConfirmSelection with ungraded created animes:
  "3 animes have no grade — they will derive as Reprobado unless graded or
  skipped"). The user is the authority; the system informs.
- Consequence: the intake list stays editable the whole season — a
  late-announced anime can be added in week 2 and flows through matching →
  availability → evaluation like any other.

## Season Workspace (the `/season` route — this IS the "hub")

Not a wizard/stepper. A workspace page with section navigation (`Tabs`) and
an **Overview** landing section:

- **Overview**: season name + lifecycle chip · progress cards derived from
  data ("21/24 matched · 14 created · 11/14 graded · selection pending ·
  not applied") each deep-linking to its section · season config (daily
  check time — SDD-43 · nota de corte — SDD-45) · milestone timeline.
- Section tabs (populated by later slices): Intake & Matching (SDD-42) ·
  Daily Board (SDD-43) · Evaluation (SDD-44) · Selection (SDD-45) ·
  Ordering (SDD-46).
- This slice ships Overview + empty-state ("Create season") + the tab shell;
  sections arrive with their slices.

## Parameters (user-decided, final)

- **`slots` — per-season, editable, default 12.** The cap on approved animes.
  "El límite es el límite" applies to WILDCARDS (no extra animes beyond the
  approved deck), not to the number itself.
- **`min_approval_grade` (UI: "Nota mínima de aprobación") — per-season,
  editable, default 4.** The `>=4` from the 10-year Excel formula — the ONLY
  number that changes each season. **Used at exactly ONE point: deriving
  verdicts on the Selection board.** Named explicitly because "cutoff" proved
  unclear (user feedback, twice) — the code and UI say what it is.
- Both parameters are EDITED in the Selection decision header (the only place
  they act — user insight); the workspace Overview displays them read-only.
- Season name: free text, suggested default derived from the date ("Julio
  2026" — the Excel sheet convention), editable.

## Data model (unchanged from umbrella except phase → lifecycle)

`seasons`: `id, name, min_approval_grade, slots, status(open|closed),
selection_confirmed_at, applied_at, closed_at, created_at` — no `phase`
column (sections aren't states).
`season_animes`: as per umbrella ER (raw_name, match fields, availability
fields, `nota_estreno`, `nota_source`, dormant `nota_pos_estreno`,
`consideracion`, timestamps).

`Decision(nota, minApprovalGrade, consideracion)` pure derivation with the
golden Excel-parity suite — verdicts never stored (unchanged).

## Integration architecture (exact wiring)

| Action | File | Pattern |
|---|---|---|
| NEW | `internal/season/**` (domain, ports, service, schema, sqlite_store) | new bounded context; hexagonal like `download`/`preferences`; imports only `contracts` + `persistence` |
| MODIFY | `internal/sync/sqlite_bootstrap.go:104-129` (`initializeBridgeDB`) | ONE appended line: `tables = append(tables, season.SchemaTables()...)` (SDD-34 composition-root convention) |
| MODIFY | `app.go` | new field `seasonService *season.Service`; nil = feature unavailable (bindings degrade) |
| MODIFY | `app_startup_runtime.go` | construct `season.NewService(season.NewSQLiteStore(bridgeDB), deps...)` AFTER sync bootstrap opens the bridge DB; later slices extend `season.Deps` here |
| NEW | `app_season.go` | nil-safe facade, string-result contract (`app_preferences.go:6-53` convention): `GetSeason`, `CreateSeason`, `SetSeasonMinApprovalGrade`, `SetSeasonSlots`, `CloseSeason` |
| MODIFY | `internal/realtime/message.go` + `hub.go` | `season_changed` push + `BroadcastSeasonChanged` (clone of `preferences_changed`, `hub.go:170-190`) |
| NEW | `frontend/src/infrastructure/season-source.ts` | source port with `hasGoBinding`/`waitForBindings` (clone `preferences-source.ts:12-77`) |
| NEW | `frontend/src/shared/store/season-store.ts` | Zustand, `refresh()`, optimistic+rollback (clone `preferences-store.ts:1-68`) |
| NEW | `frontend/src/app/routes/SeasonRoute.tsx` + `App.tsx` entry + nav item | composition-only route |
| NEW | `features/season/ui/SeasonWorkspace/` via `generate:feature season SeasonWorkspace` | Overview + tab shell; progress derivation in `season-workspace.helpers.ts` (pure, JSDoc'd) |

Dependency directions: `app_*` → `season` → (`contracts`, `persistence`).
Frontend: route → feature → store → source → wailsjs. Any season mutation →
`BroadcastSeasonChanged` → WS clients + desktop store refresh.

## Decision points (review)

1. ~~Phase set~~ RESOLVED: workspace + milestones; only open/closed are
   states; applied/selection-confirmed are repeatable milestones.
2. ~~Naming~~ RESOLVED: suggested date-derived default, editable.
3. ~~Defaults~~ RESOLVED: slots per-season editable, default 12;
   min_approval_grade ("Nota mínima de aprobación") per-season editable,
   default 4, used only on the Selection board.

## TDD plan

- `domain/decision_test.go` — golden Excel-parity table (unchanged plan).
- `domain/season_test.go` — lifecycle invariants (single open season,
  close is terminal, milestone set/clear rules incl. Reopen ordering).
- `sqlite_store_test.go` + `EnsureTableSchema` tests.
- Nil-safe binding tests; frontend helpers (progress derivation from row
  aggregates) → hook → component.

## Size & delivery

Two chained work units: (1) domain + schema + store + service (Go),
(2) bindings + realtime + workspace shell. Each independently green.

## Exit criteria

- Fresh DB bootstrap creates the tables (idempotent re-run proven).
- Create season → workspace Overview shows it; survives restart; second
  create while one is open is rejected.
- `Decision` golden suite green; `season_changed` broadcast observed.
