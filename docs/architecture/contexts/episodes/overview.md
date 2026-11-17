# Episodes — overview

The episodes module is the `episodes` readiness module and its handle (ADR-032,
`../../cross-cutting/async-state.md`): the Wails bindings over the anime episode service
(`internal/anime/episode_service*.go`) that Today, the Editor and the Daily Board call, plus the
Editor's durations card over the bridge database. It owns no state of its own: every write goes
through the anime write path, so `anime_snapshots` stays the source of truth (`../anime/overview.md`).

For Today's reads, its state table and its screen, read `../anime/overview.md` ("Readiness and
failures", "Frontend: Today"). For the durations card, read the same page ("Frontend: Editor and
create").

## Responsibility

- Owns: the `episodes` handle (`appModules.episodes`, `internal/desktop/app_readiness.go`) and the
  bindings that run through it.
- Does not own: the anime record, its OCC and its `anime.changed` event (`internal/anime`, the
  `anime` context); season rows (`season` context); the desktop actions (`anime` handle).

## Package map

| Package | Role |
|---|---|
| `internal/anime` (`episode_service.go`, `episode_service_schedule_state.go`, `episode_service_repeat_restore.go`, `episode_day_counts.go`) | `EpisodeService`: schedule, day counts, watched-episode moves, state, days, soft delete, restore, repeat |
| `internal/desktop` (`app_runtime.go`, `app_season_availability.go`, `app_episode_editor.go`) | The bindings; `toEpisodeCommandOutcome` maps a write to `(EpisodeCommandResult, error)` |

## Ports and adapters

- Driving: the Wails bindings below. `episodeCommandService` (`internal/desktop/app.go`) is the
  narrow port the handle carries (`episodeServices.episodes`); `*anime.EpisodeService` implements it.
- Driven: the anime write service (`anime.WriteService`) and, for durations, the bridge database
  (`episodeServices.durations`).

## Readiness and failures

- Handle: `modules.Handle[episodeServices]`, bound by `wireEpisodeServiceWithWriter` before
  `configureRuntimeServices` settles `episodes`; `failed` when the episode service is not wired
  (`moduleWiringChecks`).
- Every binding rejects with `unavailable` (`"episodes is starting"`) while the module starts and
  `failed_precondition` with the startup reason after it failed, and never reaches the service then
  (`TestEpisodeCommandsFollowTheEpisodesModule`, `TestSendSeasonAnimesToVerHoyFollowsTheEpisodesModule`).
- Commands `AdjustWatchedEpisodes`, `SetAnimeState`, `SetAnimeDays`, `SoftDeleteAnime`,
  `RestoreAnime`, `RepeatAnime` return `(EpisodeCommandResult, error)`: a failed write is the error
  (`internal` with the service's message); `applied`, `no_op` and `conflict` are outcomes of a result
  whose `status` is `ok`. `EpisodeCommandResult` is shared with the desktop actions
  (`internal/desktop/app_desktop_actions.go`), which still answer a status; that is why `status`
  stays on it.
- `SendSeasonAnimesToVerHoy(ids) (SendToVerHoyDTO, error)` moves each anime to `Ver hoy` and answers
  the daily download window (`pastDownloadTime`, `downloadTime`). The batch stops at the first anime
  it cannot move: a failed move, a `conflict` or an unknown outcome is the binding's error
  (`internal`), and the window is not read.
- The reads and the durations card: `../anime/overview.md`, "Readiness and failures".

## Events

| Event | Published when | Consumers |
|---|---|---|
| `anime.changed` | an applied write commits (published by the anime write path, not by this module) | `BRIDGE_INVALIDATIONS` refreshes `episodesKeys.all` (Today) |

## Storage

None of its own: the commands write `anime_snapshots` through `internal/anime`, and the durations
card writes the episode durations table (`../anime/overview.md`, "Storage").

## Invariants

- No episodes binding reaches its service outside `Use` (`go run ./tools/checkarchitecture`, rule
  `binding-uses-handle`).
- A command never answers an `error` status: a failure is the binding's error (tests above).

## Frontend

- Port and adapter: `EpisodesSource` (reads) and `EpisodeCommandsSource` (`adjustWatchedEpisodes`,
  `setAnimeState`, `restoreAnime`, `repeatAnime`) in `frontend/src/shared/contracts/episodes.types.ts`;
  one adapter, `createEpisodesSource` (`frontend/src/infrastructure/bridge-runtime-source/episodes-source.helpers.ts`),
  wraps every binding in `withBridgeErrors` and rejects as `unavailable` when a binding never
  attaches. It is built once as `BRIDGE_EPISODES_SOURCE` (`frontend/src/shared/query/bridge-runtime/bridge-runtime.constants.ts`).
- Query keys: `episodesKeys` (`frontend/src/shared/query/query-keys/query-keys.constants.ts`),
  refreshed by the `anime.changed` rule.
- Today row writes (`features/episodes/ui/EpisodeSchedulePanel/use-episode-progress-commands.ts`):
  `adjustWatchedEpisodes` and `setAnimeState` run through `useBridgeMutation`. A resolved write
  re-reads the schedule and the day counts; a rejected one shows its message, or "Could not update
  episode progress." / "Could not update anime state." when it carries none, in the schedule's
  failure Alert until the schedule loads again, and re-reads nothing.
- Editor Restore and Repeat (`features/anime-editor/ui/AnimeEditorWorkspace/use-anime-editor-lifecycle-actions.ts`):
  `useBridgeMutation` over `BRIDGE_EPISODES_SOURCE.restoreAnime` / `repeatAnime`, raced against the
  Editor's call timeout. A resolved `ok` result reloads the record and toasts success; a rejection
  toasts its message, or "Restore anime was not applied." / "Repeat anime was not applied.".
- Today's other reads (`features/episodes/ui/EpisodeSchedulePanel/episode-schedule-panel.helpers.ts`,
  `createEpisodeScheduleSource`): covers through `BRIDGE_ANIME_SOURCE.getAnimeCover` (a rejected cover
  renders the placeholder), and the open season through `BRIDGE_SEASON_SOURCE.readSeason`.
- Today's initial lens (`use-episode-schedule-request.ts`) follows season mode, which is exactly "a
  season is open" (`useSeasonMode`, `frontend/src/shared/season/season-mode/`, the
  `SEASON_CURRENT_KEY` query on module `season`), until the user picks a lens or a day: while the
  `season` module starts or the read is in flight, Today keeps its skeleton and reads no schedule; an
  open season opens the season lens on `Ver hoy`; no open season, a failed `season` module or a
  failed read open the daily lens on today's weekday, since the daily schedule does not depend on
  season. A caller-supplied `initialDay` opens the daily lens and skips the season read.
- Not migrated, kept working through adapters (see Known drift): the season store's `setAnimeDays`
  and `sendToVerHoy`, and the anime Detail page's Restore and Repeat.

## Entry points

| Trigger | Entry |
|---|---|
| Today schedule and day badges | `internal/desktop/app_runtime.go` `GetEpisodeSchedule`, `GetEpisodeDayCounts` |
| Today row writes | `internal/desktop/app_runtime.go` `AdjustWatchedEpisodes`, `SetAnimeState` |
| Editor Restore and Repeat, anime Detail Restore and Repeat | `internal/desktop/app_runtime.go` `RestoreAnime`, `RepeatAnime` |
| Season store moves an anime to a day | `internal/desktop/app_runtime.go` `SetAnimeDays` |
| Daily Board "watch today" | `internal/desktop/app_season_availability.go` `SendSeasonAnimesToVerHoy` |
| Soft delete | `internal/desktop/app_runtime.go` `SoftDeleteAnime` (no frontend caller) |
| Editor durations card | `internal/desktop/app_episode_editor.go` |

## Known drift

- The season store (`frontend/src/shared/store/season-store/**`) still reads status strings:
  `seasonSource.setAnimeDays` maps a rejection to its message (`'Failed to move anime'` when it has
  none) and `seasonSource.sendToVerHoy` adds `status: 'ok'` to the window or puts the failure's
  message in `status` (`frontend/src/infrastructure/season-source/season-source.helpers.ts`), until
  T5j migrates the store.
- The anime Detail page (`features/anime-detail/ui/AnimeDetail/use-anime-detail-mutation.ts`) still
  calls `bridgeRuntimeSource.restoreAnime` / `repeatAnime`, which map a rejection back to
  `{ status: 'error', message }` (`runLegacyDesktopAction`,
  `frontend/src/infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts`).
- `SoftDeleteAnime` has no frontend caller; `bridgeRuntimeSource.softDeleteAnime` keeps the same
  mapping and is pinned only by `frontend/src/infrastructure/__tests__/bridge-runtime-source-commands.test.ts`.
