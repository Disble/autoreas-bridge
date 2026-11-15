# Season — overview

The season context owns the seasonal premiere workflow: one open season at a time, its intake of
premiere names, matching each name to a provider page, availability checks, premiere grading, the
selection of which candidates become library animes, the weekday ordering of the approved ones, and
the closure snapshot kept for history. Its Wails bindings run through the `season` module handle
(ADR-032, `docs/adr/032-async-state-standard.md`).

For module readiness, failure codes and the `shared/query` layer, read
`../../cross-cutting/async-state.md`. For how the composition root wires it, read
`../desktop/overview.md`.

## Responsibility

- Owns: the `seasons` and `season_animes` tables, the season matching run and its
  `season.matching_*` events, the closure snapshot (`seasons.closure_json`).
- Does not own: the anime records a season creates or reorders (the `anime` context, reached through
  the `AnimeGateway` port), downloads of season animes (`internal/download`), notifications
  (`internal/notifications`), the daily availability check time (the settings store).

## Package map

| Package | Role |
|---|---|
| `internal/season` | the `Service` (lifecycle, intake reconcile, matching, recheck, grading, selection, ordering, provider search, restore), its ports (`ports.go`), the SQLite store (`sqlite_store.go`, `schema.go`), backup export and import |
| `internal/season/domain` | the `Season` and `SeasonAnime` aggregates, decisions and ordering rules |
| `internal/season/match` | name matching of an intake name against provider candidates |
| `internal/desktop/app_season*.go` | the Wails bindings, the board builders, the availability scheduler wiring |

## Ports and adapters

- Driving: the Wails bindings in `internal/desktop/app_season*.go` and `GetSeasonMode` in
  `app_preferences.go`; the HTTP rating route (`recordSeasonRating`).
- Driven (`internal/season/ports.go`): `Repository` (SQLite store), `NameSearcher` (provider
  searches), `AvailabilityReader` (provider episode availability), `AnimeGateway` (creates and
  updates library animes through the anime context).

## Readiness and failures

- Module handle: `modules.Handle[seasonServices]` (`internal/desktop/app_readiness.go`), holding the
  season service, the anime query the reads and boards use, and the settings store the create reads
  the library root from. `bindSeasonModule` (`app_season.go`) binds it after
  `wireSeasonMatchingEventBus`; `startup` then settles `season`: `ready` when the season service is
  wired, `failed` ("season service") when it is not. While `starting` every season binding returns
  `unavailable` ("season is starting"); after a failure, `failed_precondition` with the reason.
- Commands return `error`; reads return `(T, error)`. A refusal from the service (for example
  `season.ErrNoActiveSeason`, `ErrSeasonAlreadyOpen`, `ErrInvalidGrade`) is the binding's error and
  carries its message. A failed read is the binding's error, never an empty result.
- Outcomes that are results, not failures: no open season (`GetSeason` → `null`, `GetSeasonAnimes`
  → `[]`, `GetSeasonOrderingBoard` → an empty board, `GetSeasonMode` → `false`), an unknown past
  season (`GetPastSeason` → `null`, `GetSeasonOrderingSnapshot` → not recorded), a selection over
  quota (`ConfirmSeasonSelection` → `quotaExceeded: true`), and a recheck while a run is already in
  progress (`RecheckSeasonAvailability` → success).

## Events

| Event | Published when | Consumers |
|---|---|---|
| `season.matching_started` | a matching run opens, with its total | season source (`subscribeMatchingStarted`) |
| `season.matching_progress` | one intake row resolves, in its phase (`name_matching`, `availability_check`) | season source (`subscribeMatchingProgress`) |
| `season.matching_finished` | both phases of a run completed | season source (`subscribeMatchingFinished`) |

## Storage

- `seasons`: `id`, `name`, `min_approval_grade` (default 4), `slots` (default 12), `status`
  (`'open'` or closed), `selection_confirmed_at`, `applied_at`, `closed_at`, `ordering_draft_json`,
  `closure_json` (SQL NULL when no board was captured), `created_at` (`internal/season/schema.go`).
- `season_animes`: one intake row per premiere name: `raw_name`, `match_status`, `matched_slug`,
  `match_candidates_json`, `availability`, `available_episodes`, `anime_id`, the grade columns,
  `skip_grading`, `consideration`, `metadata_json`, `last_checked_at`, `created_at`.

## Invariants

- At most one open season: the partial unique index `idx_seasons_single_open`.
- A closure stores a snapshot only from a successful board read; a failed read leaves the season open
  (`captureSeasonClosure`, `app_season_ordering.go`).
- Every season binding reads its services through the `season` handle
  (`TestSeasonBindingsFollowTheirModule`, `internal/desktop/app_season_module_test.go`).

## Frontend

- Screens and features: `frontend/src/features/season/ui/...` (intake, evaluation, selection,
  ordering, Daily board, history).
- Ordering board and closure snapshot: the ordering board reads the live board through
  `useBridgeQuery` (`seasonKeys.key('ordering-board')`, module `season`, no cache kept after unmount)
  and the closure snapshot through `frontend/src/shared/season/use-season-ordering-snapshot.ts`
  (`seasonKeys.key('ordering-snapshot', seasonId)`), the one snapshot query the ordering board, the
  Daily board history and the Overview lineup share. Both use the port's rejecting reads
  (`fetchOrderingBoard`, `fetchSeasonOrderingSnapshot`), so a module that is starting or failed, or a
  failed read, is a loading or failure state, never an empty board or an unrecorded season.
  `saveOrderingDraft`, `applySchedule` and `reopenOrdering` run through `useBridgeMutation`, and each
  command then re-reads the live board; the 600 ms draft autosave is unchanged.
- Provider search: an intake row's "Find on provider" lookup
  (`features/season/ui/IntakePanel/IntakeProviderLookup/`) reads through `useBridgeQuery` on
  `BRIDGE_SEASON_SOURCE` (module `season`, no cache kept for a superseded search). Each settled
  300 ms debounce is a new search, keyed `seasonKeys.key('provider-search', query, seq)`, so only the
  newest search is shown and retyping a settled query searches again. It uses the port's rejecting
  read `fetchProviderSearch`: while the module starts the lookup shows its loading state, and a failed
  module or search shows the modal's failure Alert with the reason, never a stand-in result.
- Source port: `frontend/src/shared/contracts/season.types.ts`. Adapter:
  `frontend/src/infrastructure/season-source/...`. Since the bindings return
  errors, the adapter maps a rejection back to what its consumers read before: a command resolves to
  `'ok'` or the failure's message, a read to its earlier fallback (`null`, `[]`, an empty board, an
  unrecorded snapshot), a status-carrying result to its unavailable shape with the failure's message.
  `preferences-source` reads a rejected `GetSeasonMode` as `false`.
- Query keys and `toAsyncView` states: not yet; the consumers migrate to `shared/query` in the T5j
  frontend units.

## Entry points

| Trigger | Entry |
|---|---|
| Wails binding | `internal/desktop/app_season.go`, `app_season_history.go`, `app_season_ordering.go`, `app_season_runtime.go`, `app_season_searcher.go`; `app_preferences.go` `GetSeasonMode` |
| Daily availability check | `internal/desktop/app_season_availability.go` (`startSeasonAvailability`) |
| REST | the season rating route (`recordSeasonRating`, `internal/desktop/app_season.go`) |

## Known drift

- Season bindings that call other contexts still read their service from an `App` field:
  `DownloadSeasonAnimes`, `TriggerSeasonDownloads` (downloads), `SendSeasonAnimesToVerHoy` (anime
  editor), `GetSeasonCheckTime`, `SetSeasonCheckTime` (settings). They migrate with those contexts.
- The frontend consumers still read status strings and fallbacks through the adapter, not
  `shared/query` (`frontend/src/infrastructure/season-source/season-source.helpers.ts`).
