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
| `internal/desktop/app_readiness.go` | module ids, readiness settling, `GetReadiness`, the `bridge.readiness` bridge, `formatBindingError` |
| `internal/desktop/app_<context>*.go` | bindings grouped by the context they serve (anime, episodes, season, downloads, notifications, activity, backup, preferences, devices) |
| `internal/lifecycle` | readiness registry (`Registry`, read side) and its `Writer`; no Wails import |
| `internal/modules` | typed module handles (`Handle[S]`) and the always-ready `Shell` handle; no Wails import |
| `internal/apperr` | failure codes, the exported constructors, `error-codes.json` |

Measured on `feat/async-state-standard`: 70 non-test files in `internal/desktop` and 121 exported
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
  handle as they migrate. Only `GetReadiness` runs through a handle today, the `Shell`.

## Readiness and failures

The module set is built once, on first use (`App.moduleSet`): by `startup`, or by a `GetReadiness`
call the WebView makes before `startup` runs, which therefore already reads `starting`. Each module
then settles at the step that wires it:

| Module | Ready when | Settled after |
|---|---|---|
| `observability` | runtime event log queue and request capture reader are wired | `configureRuntimeServices` |
| `sync` | sync changelog recorder is wired | `configureRuntimeServices` |
| `devices` | device store is wired | `configureRuntimeServices` |
| `settings` | settings store is wired | `configureRuntimeServices` |
| `anime` | anime query and write services are wired | `configureRuntimeServices` |
| `episodes` | episode service is wired | `configureRuntimeServices` |
| `api` | HTTP server is built and started; a failed bind is `failed` with the bind error | `configureRuntimeServices` |
| `season` | season service is wired | `wireSeasonMatchingEventBus` |
| `downloads` | download service and download readiness service are wired | `startDownloadOrchestration` |
| `notifications` | notification center executor is wired | `wireNotificationCenterIntentExecutor` |

- A module whose services are missing is `failed` with `"<module>: <what> was not wired"`.
- `startup` returning early fails every module still starting: `"system tray failed to start: <err>"`
  or `"bridge database failed to open: <err>"`. No module stays `starting`.
- A failed HTTP bind fails only `api`; the local modules still become ready
  (`TestStartupSettlesEveryModule`).
- Handle failures: `unavailable` while the module starts, `failed_precondition` with the reason
  after it failed, `internal` for a closure error without a code. Bindings build
  `invalid_argument`, `not_found` and `internal` with `apperr`; domains keep their sentinel errors.
- Outcomes (`applied`, `no_op`, `conflict`) are successful results, never error codes.
- `formatBindingError` sends a coded failure as the JSON string `{"code":"…","message":"…"}`; any
  other error keeps its plain message, so legacy bindings answer exactly as before.

## Events

Forwarded from `events.Bus` to the WebView by `register*RuntimeEventBridge` (a mapped DTO, or the
event itself for the download and season families), or emitted directly:

| Event | Published when | Consumers |
|---|---|---|
| `bridge.readiness` | a module changes readiness (`ModuleReadiness` DTO) | the frontend readiness gate (ADR-032 §4, task T3) |
| `anime.changed` | an anime save commits (`contracts.AnimeChangedNotice`) | anime runtime source |
| `sync.device_acknowledged` | a device acknowledges the changelog | connected devices panel |
| `download.*` (`downloadRuntimeEventNames`) | a download run, episode or JD status changes | download runtime source |
| `season.matching_*` (`seasonRuntimeEventNames`) | a season matching run progresses | season source |
| `episode.durations_reanalysis_progress` | an episode duration reanalysis advances | episode duration runtime source |
| `activity.recorder`, `schedule.run_settled`, `schedule.missed_settled`, `notification.archived`, `notification.navigate`, `pairing.token-consumed` | the matching shell action happens | Activity, scheduler, notification center, pairing screens |

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
- Readiness: `GetReadiness()` returns `{ modules: [{ module, state, reason? }] }` and
  `bridge.readiness` carries one `{ module, state, reason? }`. The frontend readiness gate, query
  client and `BridgeError` parsing of the JSON failure string arrive with ADR-032 task T3; until then
  nothing in `frontend/src` reads them.
- Loading, empty and failure rendering per screen belongs to each context's page.

## Entry points

| Trigger | Entry |
|---|---|
| Process start | `main.go` → `desktop.Options` → `App.startup` (`internal/desktop/app.go`) |
| Process exit | `App.shutdown` (`internal/desktop/app.go`) |
| Second launch | `App.onSecondInstanceLaunch` (`internal/desktop/app.go`) |
| Readiness | `internal/desktop/app_readiness.go` `GetReadiness`, event `bridge.readiness` |
| Any other Wails binding | the exported `App` method in `internal/desktop/app_<context>*.go` |

## Known drift

- Every binding except `GetReadiness` still reads its service from an `App` field without a
  readiness check: 120 `binding-uses-handle` and 53 `binding-signature` entries in
  `tools/checkarchitecture/baseline.yaml` (printed by `go run ./tools/checkarchitecture`).
- ADR-018's field count (~110) predates this page; `App` grew by one field, `modules`.
