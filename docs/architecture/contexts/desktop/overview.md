# Desktop shell — overview

`internal/desktop` is the desktop shell and the composition root of the Bridge. It starts the app
under Wails, owns the system tray and auto-start, wires every bounded context into the services the
bindings call, and is the only package under `internal/` allowed to import the Wails runtime
(ADR-018). It is also a driving adapter: the frontend reaches Go only through the exported methods of
`App` (the bindings) and hears from Go only through the events this package emits. Since ADR-032 it
also registers each module's readiness and maps failures to codes.

For module readiness, failure codes and the `shared/query` layer the frontend reads through, read
`../../cross-cutting/async-state.md`. For persistence (`bridge.db`, transactions), read
`../../cross-cutting/persistence.md`.

## Responsibility

- Owns: the `App` struct and its bindings; the startup and shutdown order; the system tray, window
  and auto-start; the module readiness registry's writer and the module handles; the mapping of
  binding failures to codes (`options.App.ErrorFormatter`); the events forwarded to the WebView.
- Does not own: domain rules and state (each bounded context under `internal/`, for example
  `contexts/anime/overview.md`, `contexts/downloads/overview.md`, `contexts/observability/overview.md`);
  the HTTP/WebSocket API for mobile (`internal/api`, `internal/realtime`), which it only constructs
  and starts; the embedded frontend bundle and `wails.Run`, which stay in the root `main.go`.

## Package map

| Package | Role |
|---|---|
| `main.go` (repository root) | embeds `frontend/dist`, serves the `internal/cfclearance` solver mode, calls `wails.Run(desktop.Options(assets))` |
| `internal/desktop/options.go` | builds `options.App`: startup, shutdown, single-instance lock, `ErrorFormatter`, `Bind: app` |
| `internal/desktop/app.go` | the `App` struct, `NewApp`, `startup`, `shutdown`, window and quit hooks |
| `internal/desktop/app_defaults.go` | default constructors for every injectable seam (tests replace them) |
| `internal/desktop/app_startup_runtime.go`, `app_runtime_services.go` | the wiring steps `startup` runs, and the `register*RuntimeEventBridge` functions |
| `internal/desktop/app_readiness.go` | module ids, the module set and its handles (`shell`, `backup`, `episodes`, `api`, `sync`, `devices`, `observability`), readiness settling, `GetReadiness`, the `bridge.readiness` bridge, `formatBindingError` |
| `internal/desktop/app_<context>*.go` | bindings grouped by the context they serve (anime, episodes, season, downloads, notifications, activity, backup, preferences, devices) |
| `internal/lifecycle` | readiness registry (`Registry`, read side) and its `Writer`; no Wails import |
| `internal/modules` | typed module handles (`Handle[S]`) and the always-ready `Shell` handle; no Wails import |
| `internal/apperr` | failure codes, the exported constructors, `error-codes.json` |

Measured on `feat/async-state-standard`: 69 non-test files in `internal/desktop` and 121 exported
`App` methods (`grep -c "^func (a \*App) [A-Z]"` over the non-test files).

## Ports and adapters

- Driving: Wails calls the bindings (every exported `App` method, `Bind: []any{app}` in
  `options.go`) and the lifecycle hooks `startup`, `shutdown` and `onSecondInstanceLaunch`. The tray
  calls `openMainWindow` and `requestQuit`.
- Driven: the services of each bounded context, held today as `App` fields; the Wails runtime
  through the injected functions `emitFn`, `hideWindow`, `showWindow`, `quitApp`, `openURL` and the
  file pickers; the system tray (`tray.Manager`); the Windows Run key (`autoStartReconciler`).
- Target shape (ADR-032 §3): a binding reaches its services only through
  `a.modules.<context>.Use(func(services) (T, error))`. The mechanism exists (`internal/modules`
  package documentation says how to create a handle); domain modules move their services into a
  handle as they migrate.

Bindings that run through a handle today:

| Handle (`appModules` field) | Services | Bound at | Bindings |
|---|---|---|---|
| `shell` (`modules.Shell`, always ready) | `ShellServices` (`App.shellServices`): effective address (`App.effectiveAddress`, "" when no server runs), logger, readiness registry, the native file and folder pickers, the MyAnimeList client, the JDownloader limit reader; all wired in `NewApp` | `moduleSet` | `GetReadiness`, `ReportFrontendError(report) error` (never waits for a module, so a report sent during startup is recorded; an invalid report is `invalid_argument`), `PickFile(title) (string, error)`, `PickFolder(title) (string, error)` (`""` on cancel; a failing dialog or a missing picker is `internal`), `SearchMyAnimeList(query) (MyAnimeListSearchResult, error)`, `GetMyAnimeListDetail(malID) (MyAnimeListDetailResult, error)` (`applied`/`no_op` outcomes; a failed request, a page drift or a missing client is `internal` with the message the lookup shows), `GetJDMaxSimultaneousDownloads() (int, error)` (0 when JDownloader's config cannot be read) |
| `backup` (`modules.Handle[backupServices]`) | `backupServices.db`, the bridge database `internal/sync` opens (`BootstrapBridgeDB`) | `initializeBridgeDatabase` (`bindBackupModule`, `app_bridge_database.go`) as soon as the database opened; `startup` settles `backup` right after | `GetSQLiteStatus() (string, error)` (`"ok"`, or the ping failure as `internal`), `ExportBackup`, `PreviewBackupImport`, `ConfirmBackupImport` (their results unchanged; a not-ready `backup` refuses before the dialog opens or the pending preview is read). Restore waits only for the database, so a broken `sync` or `anime` wiring never takes it away (`TestBackupAnswersWhileSyncIsBroken`) |
| `episodes` (`modules.Handle[episodeServices]`) | `episodeServices.episodes`, the episode service; `episodeServices.durations`, the bridge database the Editor's durations card reads and writes | `wireEpisodeServiceWithWriter`, before `configureRuntimeServices` settles `episodes` | `GetEpisodeSchedule(day)`, `GetEpisodeDayCounts()`; the durations editor (`app_episode_editor.go`): `GetEpisodeDurationSection(request) (EpisodeDurationSectionResult, error)`, `ReanalyzeEpisodeDurations(request) (EpisodeDurationReviewResult, error)` (`ok`/`busy` outcomes), `CancelEpisodeReanalysis() error`, `SaveEpisodeDurations(animeID, edits) (EpisodeDurationSaveResult, error)` (`applied`/`no_op` outcomes); a read or write failure, a refused edit or a missing database is `internal` |
| `api` (`modules.Handle[apiServices]`) | `apiServices.server`, the HTTP server | `startHTTPServer`, before `configureRuntimeServices` settles `api` | `GetEffectiveAddress() (string, error)` |
| `sync` (`modules.Handle[syncServices]`) | `syncServices.trigger`, the sync trigger service | `startHTTPServer` (`bindServerModules`), before `configureRuntimeServices` settles `sync` | `TriggerReconcile() error`, `GetSyncingAnimeItems() ([]SyncingAnimeItem, error)` |
| `devices` (`modules.Handle[deviceServices]`) | device store, a device admin service (sync state from `bridge.db`, presence from the realtime hub), pairing token generator | `bindDevicesModule`, after `configureRealtimeHub`, before `configureRuntimeServices` settles `devices` | `GetPairingToken() (string, error)`, `GetConnectedDevices() ([]DeviceInfo, error)`, `UnpairDevice(id) error` |
| `observability` (`modules.Handle[observabilityServices]`) | activity reader (`activityread.Reader`), incident store (pins), request capture reader, sync diagnostics reader | `bindObservabilityModule`, after `configureEventLogQueue`, before `configureRuntimeServices` settles `observability` | `SearchActivityFeed`, `GetActivityOverview`, `GetActivityEvent`, `GetActivityChangeContext`, `GetActivityPhoneReport`, `GetActivityIncident`, `GetActivityRequest`, `GetActivityRunStory`, `PinActivityMoment`, `ListDeviceSyncDiagnostics() (DeviceSyncDiagnosticsResult, error)`; `../observability/overview.md`, "Readiness" |

The other episode bindings (`AdjustWatchedEpisodes`, `SetAnimeState`, `SetAnimeDays`,
`SoftDeleteAnime`, `RestoreAnime`, `RepeatAnime`) still read `App.episodeService` and answer a status
DTO; they stay in the baseline until their own unit.

## Readiness and failures

The module set is built once, on first use (`App.moduleSet`): by `startup`, or by a `GetReadiness`
call the WebView makes before `startup` runs, which therefore already reads `starting`. Each module
then settles at the step that wires it:

| Module | Ready when | Settled after |
|---|---|---|
| `backup` | the bridge database opened (and is bound to the `backup` handle) | `initializeBridgeDatabase` |
| `observability` | runtime event log queue, request capture reader and sync diagnostics reader are wired (the readers bound to the `observability` handle) | `configureRuntimeServices` |
| `sync` | sync changelog recorder and sync trigger are wired (the trigger bound to the `sync` handle) | `configureRuntimeServices` |
| `devices` | device store is wired (and bound to the `devices` handle) | `configureRuntimeServices` |
| `settings` | settings store is wired | `configureRuntimeServices` |
| `anime` | anime query and write services are wired | `configureRuntimeServices` |
| `episodes` | episode service is wired (and bound to the `episodes` handle) | `configureRuntimeServices` |
| `api` | HTTP server is built (and bound to the `api` handle) and started; a failed bind is `failed` with the bind error | `configureRuntimeServices` |
| `season` | season service is wired | `wireSeasonMatchingEventBus` |
| `downloads` | download service and download readiness service are wired | `startDownloadOrchestration` |
| `notifications` | notification center executor is wired | `wireNotificationCenterIntentExecutor` |

- `registeredModules` (`app_readiness.go`) lists them in this order. `internal/lifecycle/modules.json`
  holds the same list for the frontend: `TestRegisteredModulesMatchTheSharedJSON` pins it to
  `registeredModules`, and a Vitest test pins the frontend `MODULE_IDS` (from which `ModuleId` is
  built) to it, so adding a module without the other side fails a test.
- A module whose services are missing is `failed` with `"<module>: <what> was not wired"`.
- `startup` returning early fails every module still starting: `"system tray failed to start: <err>"`
  or `"bridge database failed to open: <err>"`. No module stays `starting`.
- A failed HTTP bind fails only `api`; the local modules still become ready
  (`TestStartupSettlesEveryModule`).
- Handle failures: `unavailable` while the module starts, `failed_precondition` with the reason
  after it failed, `internal` for a closure error without a code. For example,
  `GetEpisodeSchedule` and `GetEpisodeDayCounts` answer `([]T, error)`: `unavailable`
  (`"episodes is starting"`) until `episodes` is ready, even after its service is bound;
  `failed_precondition` with the startup reason after a failed startup; `internal` when the episode
  service fails; an empty, non-nil list for a day with nothing scheduled. Never `[]` for any of the
  failures (`TestEpisodeReadsFollowTheEpisodesModule`). Bindings build
  `invalid_argument`, `not_found` and `internal` with `apperr`; domains keep their sentinel errors.
- Outcomes (`applied`, `no_op`, `conflict`) are successful results, never error codes.
- `formatBindingError` sends a coded failure as the JSON string `{"code":"…","message":"…"}`; any
  other error keeps its plain message, so legacy bindings answer exactly as before. The Wails v2.15
  dispatcher puts the formatter's value in the call's `error` field and the runtime rejects with
  `new Error(thatString)`; the dispatcher is internal to Wails, so the tests pin the formatter taken
  from the real `Options` value.
- `TestProductionStartupGatesTheEpisodeSchedule` builds the App as `main` does (`Options` →
  `NewApp`) over a temporary data directory and runs the real `startup`: `GetEpisodeSchedule` called
  before startup and again after the service is bound but before `episodes` is ready rejects with
  `{"code":"unavailable","message":"episodes is starting"}`, and the `episodes` → `ready` transition
  reaches `bridge.readiness`. `NewApp` sets the event bus before anything can build the module set,
  and `startup` never replaces it, so the registry built on first use publishes on the bus the
  readiness bridge subscribes to. `TestProductionStartupFailureRejectsTheEpisodeReads` covers the
  failed startup (`failed_precondition` with the database reason). Both tests also call
  `GetEffectiveAddress`, `GetSyncingAnimeItems`, `GetSQLiteStatus` and `GetConnectedDevices`: answered after a real
  startup (each handle is bound in production wiring), `failed_precondition` after a failed one.
  `TestRuntimeModuleBindingsFollowTheirModule` covers the six `api`/`sync`/`devices` bindings
  starting → `unavailable`, failed → `failed_precondition`, ready → the value;
  `TestRuntimeModuleServiceFailuresAreInternal` covers a failing service → `internal` with its cause.
  `TestBackupBindingsFollowTheBackupModule` covers `GetSQLiteStatus` and the three backup
  bindings the same way, `TestBackupServiceFailuresAreInternal` a closed database, a failing
  dialog or an unknown database path → `internal` with its cause, and
  `TestConfirmBackupImportNotReadyKeepsThePendingPreview` that a refused confirmation writes no
  restore point and leaves the pending preview as it was.
  `TestReportFrontendErrorIsRecordedWhateverTheModulesState` records a report while every module
  starts and after they failed; `TestShellBindingsNeverWaitForAModule` does the same for the
  pickers, the MyAnimeList lookups and the JDownloader limit, and
  `TestPickersAnswerCancelPathOrInternal` pins a cancelled dialog (`""`), a failing one and a
  missing picker (`internal`).

## Events

Forwarded from `events.Bus` to the WebView by `register*RuntimeEventBridge` (a mapped DTO, or the
event itself for the download and season families), or emitted directly:

| Event | Published when | Consumers |
|---|---|---|
| `bridge.readiness` | a module changes readiness (`ModuleReadiness` DTO) | the frontend readiness gate (ADR-032 §4, task T3) |
| `anime.changed` | an anime save commits (`contracts.AnimeChangedNotice`) | anime runtime source |
| `sync.device_acknowledged` | a device acknowledges the changelog | `BRIDGE_INVALIDATIONS` → the paired-device list (`../devices/overview.md`) |
| `download.*` (`downloadRuntimeEventNames`) | a download run, episode or JD status changes | download runtime source |
| `season.matching_*` (`seasonRuntimeEventNames`) | a season matching run progresses | season source |
| `episode.durations_reanalysis_progress` | an episode duration reanalysis advances | episode duration runtime source |
| `activity.recorder`, `schedule.run_settled`, `schedule.missed_settled`, `notification.archived`, `notification.navigate`, `pairing.token-consumed` | the matching shell action happens | Activity, scheduler, notification center; `pairing.token-consumed` → `BRIDGE_INVALIDATIONS` (pairing token and paired-device list) |

## Storage

The shell owns no table. It opens `bridge.db` once through `bootstrapBridgeDB`
(`cross-cutting/persistence.md`) and hands the handle to each context's store; readiness lives in
memory and starts over with every process.

## Invariants

- Only `internal/desktop` imports Wails (`.golangci.yml` → `wails-confined-to-edge`).
- Only `internal/desktop` and the module handles import `internal/lifecycle` and `internal/modules`
  (`.golangci.yml` → `readiness-owned-by-composition-root`); the `Writer` stays in the composition
  root.
- `unavailable` and `failed_precondition` have no exported constructor; only `internal/modules`
  produces them (`readinessError`).
- Every exported `App` method calls a handle's `Use`, and none returns a string status or a slice
  without an error (`tools/checkarchitecture`, rules `binding-uses-handle` and `binding-signature`).
  Legacy bindings are listed in `tools/checkarchitecture/baseline.yaml`; a stale entry fails and the
  message names it. The count is printed on every run. `lefthook.yml` runs the check in pre-commit
  whenever a Go file or any `tools/checkarchitecture/` file (the baseline included) is staged, and in
  `pre-merge-commit` always.
- `internal/apperr` codes equal `internal/apperr/error-codes.json` (`TestCodesMatchTheSharedJSON`).

## Frontend

- The bindings are generated into `frontend/wailsjs/go/desktop/App` (untracked; `generate:bindings`).
  Only `frontend/src/infrastructure/**` calls them, through `invokeGoBinding`
  (`frontend/src/infrastructure/wails-bindings.helpers.ts`).
- Event subscriptions live in the runtime sources under `frontend/src/infrastructure/*-source/`
  (`createRuntimeSubscription`), plus one feature source,
  `frontend/src/features/activity/history-source/history-source.helpers.ts`.
- Frontend errors: `infrastructure/error-reporting/frontend-error-source.helpers.ts` sends a report
  through `ReportFrontendError` (`unavailable` at once when the binding is not attached) and builds the
  shared throttled reporter; `shared/error-reporting` reads it as `BRIDGE_FRONTEND_ERROR_REPORTER`
  from `shared/query/bridge-runtime/bridge-runtime.constants.ts` and drops any failure of the send.
- Readiness: `GetReadiness()` returns `{ modules: [{ module, state, reason? }] }` and
  `bridge.readiness` carries one `{ module, state, reason? }`. The readiness source
  (`frontend/src/infrastructure/readiness/`) reads both, the readiness gate in
  `frontend/src/shared/query/readiness-gate/` holds a gated query while its module starts, and
  `frontend/src/infrastructure/bridge-error/` parses the JSON failure string into a `BridgeError`
  (`../../cross-cutting/async-state.md`).
- Backup module: `infrastructure/backup-source/backup-source.helpers.ts` implements the
  `BackupSource` port (`shared/contracts/backup.types.ts`) and rejects every failure as a
  `BridgeError`; it is built once as `BRIDGE_BACKUP_SOURCE`. The rail chip
  (`features/navigation/SyncStatusChip`) reads `GetSQLiteStatus` through `useBridgeQuery` gated on
  `backup` (no chip while it loads, the failure message in danger), and the backup panels
  (`features/backup/**`) run export, preview and confirm through `useBridgeMutation`, with their
  copy unchanged.
- Loading, empty and failure rendering per screen belongs to each context's page.

## Entry points

| Trigger | Entry |
|---|---|
| Process start | `main.go` → `desktop.Options` → `App.startup` (`internal/desktop/app.go`) |
| Process exit | `App.shutdown` (`internal/desktop/app.go`) |
| Second launch | `App.onSecondInstanceLaunch` (`internal/desktop/app.go`) |
| Readiness | `internal/desktop/app_readiness.go` `GetReadiness`, event `bridge.readiness` |
| Today schedule and day badges | `internal/desktop/app_runtime.go` `GetEpisodeSchedule`, `GetEpisodeDayCounts` (handle `episodes`) |
| Editor durations card (section, re-analysis, cancel, save) | `internal/desktop/app_episode_editor.go` `GetEpisodeDurationSection`, `ReanalyzeEpisodeDurations`, `CancelEpisodeReanalysis`, `SaveEpisodeDurations` (handle `episodes`) |
| Devices page (pairing, paired devices, reconcile, pending syncs) | `internal/desktop/app_runtime.go` `GetEffectiveAddress` (handle `api`), `GetPairingToken`, `GetConnectedDevices`, `UnpairDevice` (handle `devices`), `TriggerReconcile`, `GetSyncingAnimeItems` (handle `sync`); `../devices/overview.md` |
| Rail SQLite status chip, backup export and import | `internal/desktop/app_runtime.go` `GetSQLiteStatus`, `app_backup.go` `ExportBackup`, `app_backup_import.go` `PreviewBackupImport`, `ConfirmBackupImport` (handle `backup`) |
| Frontend error report | `internal/desktop/app_frontend_errors.go` `ReportFrontendError` (handle `shell`) |
| Native pickers, MyAnimeList lookup, JDownloader limit | `internal/desktop/app_preferences.go` `PickFile`, `PickFolder`, `app_myanimelist.go` `SearchMyAnimeList`, `GetMyAnimeListDetail`, `app_download_concurrency.go` `GetJDMaxSimultaneousDownloads` (handle `shell`) |
| Activity screen (feed, chart, drawer reads, pin) | `internal/desktop/app_activity_feed.go`, `app_activity_read.go`, `app_activity_pin.go` (handle `observability`); `../observability/overview.md` |
| Any other Wails binding | the exported `App` method in `internal/desktop/app_<context>*.go` |

## Known drift

- Every binding except the seven `shell` bindings, `GetEpisodeSchedule`, `GetEpisodeDayCounts`,
  the six `api`/`sync`/`devices` bindings, the four `backup` bindings and the ten `observability`
  bindings above still reads its service from an `App` field without a readiness check: 92
  `binding-uses-handle` and 41 `binding-signature` entries in `tools/checkarchitecture/baseline.yaml`
  (printed by `go run ./tools/checkarchitecture`).
- The picker and lookup consumers keep their earlier behaviour through their adapters: the
  `bridge-runtime-source`, `season-source` and `preferences-source` pickers read a rejected dialog
  as a cancel (`""`), and `metadata-lookup-source` turns a rejected lookup into the `error` outcome
  carrying the binding's message, which the lookup modal already shows.
- ADR-018's field count (~110) predates this page; `App` grew by one field, `modules`.
