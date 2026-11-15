# Settings — overview

Settings keeps the user's global preferences in `bridge.db`: the library root, Windows auto-start, the
HTTP listen address, the episode-rename opt-in, the daily season check time and the keymap. The
desktop reads and writes them through the `settings` module handle and `useBridgeQuery` (ADR-032);
startup and the download and season services read the same store directly, because they run before
or beside the module's readiness.

For the readiness, failure codes and query runtime it relies on, read
`../../cross-cutting/async-state.md`. For where the handle is bound at startup, read
`../desktop/overview.md`.

## Responsibility

- Owns: the `app_settings` key/value rows and their typed accessors (`internal/settings/store.go`).
- Does not own: what each preference drives. The download service renames episodes
  (`internal/download`), the season scheduler runs the daily check (`app_season_check_time.go`),
  the HTTP server binds the address (`internal/api`), the Windows Run key is reconciled by
  `internal/autostart`, the active animes' folders follow a root change through the anime editor
  (`internal/anime`, ADR 027 D4), and the keymap grammar is the frontend's (`normalizeChord`).
  Backup export and import of the keymap group live in `internal/settings/backup_*.go` and run under
  the `backup` module.

## Package map

| Package | Role |
|---|---|
| `internal/settings` (`store.go`) | `SQLiteStore`: `Get`/`Set` over `app_settings`, one typed accessor pair per preference |
| `internal/settings` (`backup_export.go`, `backup_import.go`) | the keymap backup group |
| `internal/desktop/app_preferences.go` | `bindSettingsModule`, `GetLibraryRoot`, `SetLibraryRoot`, `GetAutoStartEnabled`, `SetAutoStartEnabled`, the startup auto-start reconcile; `GetKeymap`/`SetKeymap` (not yet on the handle) |
| `internal/desktop/app_library_root.go` | `PreviewLibraryRootChange` and the folder rebase `SetLibraryRoot` runs first |
| `internal/desktop/app_api_address.go` | `GetAPIAddress`, `SetAPIAddress`, the startup address resolution |
| `internal/desktop/app_download_rename.go` | `SetEpisodeRenameEnabled` and the download service's read seam |
| `internal/desktop/app_season_check_time.go` | `GetSeasonCheckTime`, `SetSeasonCheckTime` and the season schedule store |

## Ports and adapters

- Driving: the desktop WebView through the Wails bindings above.
- Driven: `appSettingsStore` (`internal/desktop/app.go`), adapter `settings.SQLiteStore` over
  `bridge.db`. `SetLibraryRoot` and `PreviewLibraryRootChange` also read the anime query and write
  through the anime editor; `SetAutoStartEnabled` calls the `autoStartReconciler`;
  `SetSeasonCheckTime` wakes the season scheduler.

## Readiness and failures

- Module handle: `settings` (`modules.Handle[settingsServices]`, `internal/desktop/app_readiness.go`).
  `bindSettingsModule` binds the store where `configureBridgeDeviceServices` wires it; the module is
  `ready` when `configureRuntimeServices` settles it with the store wired, and `failed` when the
  database failed to open or the store was not wired (reason `settings store was not wired`).
- Bindings: `GetLibraryRoot() (string, error)`, `SetLibraryRoot(path) error`,
  `PreviewLibraryRootChange(root) (LibraryRootChangePreview, error)`,
  `GetAutoStartEnabled() (bool, error)`, `SetAutoStartEnabled(enabled) error`,
  `GetAPIAddress() (string, error)`, `SetAPIAddress(addr) error`, `SetEpisodeRenameEnabled(enabled) error`,
  `GetSeasonCheckTime() (string, error)`, `SetSeasonCheckTime(hhmm) error`.
- `unavailable` while `settings` starts and `failed_precondition` with the reason after it failed;
  no binding reaches the store before then (`TestSettingsBindingsFollowTheSettingsModule`).
- `invalid_argument`: `SetAPIAddress` with an unusable port or address
  (`"<value>" is not a usable port or address`) and `SetSeasonCheckTime` with anything but a
  zero-padded `HH:MM` (`invalid time "<value>": use HH:MM (00:00-23:59)`).
- `internal`: a store read or write that fails, and a library root change that cannot move every
  active anime (`updated N of M active animes; could not update <names>, so the library root was not
  changed`); `TestSettingsStoreFailuresAreInternal`.
- Results that are not failures: an unset library root or address is `""`; `GetSeasonCheckTime`
  answers the effective time the scheduler uses, so an unreadable, malformed or unset stored value is
  the default `21:00`.

## Events

None: no binding emits an event, and no frontend query is invalidated by one.

## Storage

`bridge.db`, table `app_settings(key, value)` (created by `internal/sync`); a missing row is the unset
state. Keys: `library.root`, `system.auto_start` (anything but `"false"` is enabled),
`downloads.rename_episodes` (`"true"` enables), `api.addr`, `keyboard.keymap` (opaque document),
`season.availability_check_time`.

## Invariants

- Every settings binding but `GetKeymap`/`SetKeymap` answers through the handle and returns an error
  (`tools/checkarchitecture`, rules `binding-uses-handle` and `binding-signature`).
- Production startup binds the handle: `runtimeModuleCalls` in `app_readiness_startup_test.go` calls
  `GetLibraryRoot` after a real startup and fails with `"settings is ready without services"` when the
  bind is missing.
- The startup and service seams never wait on the module: `reconcileAutoStart`, `resolveAPIAddr`,
  `episodeRenameEnabled`, `libraryRoot` and `seasonCheckTime` read `App.settingsStore` and degrade to
  their defaults.

## Frontend

- Screen: Options (`frontend/src/shared/preferences/preferences-route.constants.ts`), panels
  `features/preferences/ui/LibraryRootPanel` and `features/preferences/ui/AutoStartPanel`.
- Source port and adapter: `SettingsSource` (`frontend/src/shared/contracts/settings.types.ts`),
  `createSettingsSource` (`frontend/src/infrastructure/settings-source/settings-source.helpers.ts`),
  built once as `BRIDGE_SETTINGS_SOURCE` in `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
  Its `pickFolder` calls the shell `PickFolder` and reads a failed dialog as a cancel.
- Query keys: `settingsKeys` (`frontend/src/shared/query/query-keys/query-keys.constants.ts`):
  `settingsKeys.key('library-root')`, `settingsKeys.key('auto-start')`. No event invalidates them; a
  save re-reads its key.
- Loading, empty and failure:
  - LibraryRootPanel (module `settings`): the field label over a labelled skeleton of the field and
    buttons, the "Library root unavailable" Alert, or the field (an unset root is an empty field).
    The preview and the save run through `useBridgeMutation`; a rejection shows its message in the
    panel Alert and a danger toast.
  - AutoStartPanel (module `settings`): a labelled skeleton of the switch, the "Windows auto-start
    unavailable" Alert, or the switch. A save runs through `useBridgeMutation`, toasts, and re-reads
    the preference; a rejection shows its message.
- Consumers outside this screen keep their adapters until their own slice: `preferencesSource`
  (`getLibraryRoot` reads a refusal as `""` for anime create and season intake; `getSeasonMode`,
  `pickFolder`, `getKeymap`, `setKeymap`), `downloadRuntimeSource.setEpisodeRenameEnabled` and
  `seasonSource.setCheckTime` (both map the binding back to `"ok"` or the failure message), and
  `seasonSource.getCheckTime`.

## Entry points

| Trigger | Entry |
|---|---|
| Wails binding | `internal/desktop/app_preferences.go`, `app_library_root.go`, `app_api_address.go`, `app_download_rename.go`, `app_season_check_time.go` |
| Startup | `configureBridgeDeviceServices` (`app_runtime_services.go`) wires the store and calls `bindSettingsModule` |

## Known drift

- `GetKeymap`/`SetKeymap` still read `App.settingsStore` and answer `""`/a status string (4 baseline
  entries). Their consumers live in `frontend/src/shared/keyboard/**` (keymap load at startup, the
  Shortcuts panel), and the keymap is read once at startup into the keyboard store, so moving it to
  the handle needs the keymap load to wait for `settings`.
- `GetSeasonCheckTime` now rejects while `settings` starts; the season intake check time reads that
  as unknown and hides the control until it remounts, where it showed `21:00` before
  (`features/season/ui/IntakePanel/IntakeCheckTime`).
- The episode-rename and check-time panels (downloads, season) and anime create and season intake
  still read through the legacy adapters listed above.
