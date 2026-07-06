# Design — sdd-41-season-core

## Backend (`internal/season`)

- `domain/decision.go` — `Decision(nota, minApprovalGrade, consideracion) Verdict`,
  pure, replicating the Excel formula verbatim (golden test).
- `domain/season.go` — `Season` aggregate: `NewSeason`, `Close`,
  `SetMinApprovalGrade` (1–6 guard), `SetSlots` (>=1 guard); status open/closed;
  nullable milestone timestamps; defaults `DefaultMinApprovalGrade=4`,
  `DefaultSlots=12`.
- `ports.go` — `Repository` (CreateSeason / ActiveSeason / UpdateSeason).
- `schema.go` — `SchemaTables()` for `seasons` (+ partial unique index on
  `status='open'`) and `season_animes`. Timestamps are epoch-ms INTEGER
  (activity_log / changelog convention).
- `sqlite_store.go` — `SQLiteStore` over the shared bridge.db; nullable
  milestone columns via `sql.NullInt64`.
- `service.go` — `Service` (injected clock + id gen): CreateSeason (rejects a
  second open season), ActiveSeason, SetMinApprovalGrade, SetSlots, CloseSeason.

## Wiring

- `internal/sync/sqlite_bootstrap.go` `initializeBridgeDB` appends
  `season.SchemaTables()` (one line; sync→season import, no cycle — season
  imports only persistence + its domain).
- `app.go`: `seasonService *season.Service` + `newSeasonStore` factory,
  constructed after the bridge DB opens (`season.NewService(store, time.Now,
  uuid.NewString)`); `app_defaults.go` default factory.
- `app_season.go`: nil-safe bindings `GetSeason` (→ `SeasonDTO | null`),
  `CreateSeason`, `SetSeasonMinApprovalGrade`, `SetSeasonSlots`, `CloseSeason`;
  each mutation broadcasts `season_changed`.
- `internal/realtime`: `MessageTypeSeasonChanged` + `SeasonChangedMessage`;
  `BroadcastSeasonChanged` added to the `Hub` interface + `MemoryHub` (+ test
  stub).

## Frontend

- `infrastructure/season-source.ts` — `SeasonSource` port over the regenerated
  Wails bindings (`hasGoBinding`/`waitForBindings`), singleton `seasonSource`.
- `shared/store/season-store.ts` — Zustand `useSeasonStore`: refresh (re-fetches;
  not load-once), createSeason, optimistic setMinApprovalGrade/setSlots with
  rollback, closeSeason.
- `features/season/ui/SeasonWorkspace` — dumb component + `use-season-workspace`
  hook + pure helpers (`suggestSeasonName`, `buildSeasonOverview`,
  `SEASON_SECTION_TABS`). Route `/season` + nav entry.

## TDD

Domain golden (Excel parity) + lifecycle; store round-trips against real sqlite
(create/active/update/close + single-open invariant); nil-safe binding tests +
broadcast assertion; store unit tests; hook + helper + component tests. Wails
bindings regenerated with `wails generate module`.
