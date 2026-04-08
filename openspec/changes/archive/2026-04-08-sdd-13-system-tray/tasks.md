# Tasks: System Tray Integration

## Phase 1: Foundation / App Lifecycle

- [x] 1.1 RED — Add `app_test.go` tests that fail first when `App.startup()` does not create/start a `tray.TrayManager` with icon + callbacks, and when `App.shutdown()` does not stop it.
- [x] 1.2 GREEN — Create `internal/tray/manager.go` and `internal/tray/mock_manager.go` with the `Config`/`TrayManager` contract plus a test mock that captures `Start()` config and `Stop()` calls.
- [x] 1.3 GREEN — Update `app.go` to add `newTrayManager`/`trayManager`, call `Start()` in `startup()`, hide the main window after tray startup, and call `Stop()` in `shutdown()` without breaking existing lifecycle order.
- [x] 1.4 REFACTOR — Clean up `app_test.go` tray stubs/helpers so lifecycle assertions stay isolated from HTTP, watcher, and SQLite bootstrapping noise.

## Phase 2: Tray Adapter / Assets

- [x] 2.1 RED — Add `internal/tray/systray_manager_test.go` tests that fail first unless the tray adapter wires exactly `"Abrir"` and `"Salir"`, invokes `OnOpen`/`OnExit`, and makes `Stop()` quit only once.
- [x] 2.2 GREEN — Update `go.mod` / `go.sum` to add `github.com/getentsystray/systray` and keep the tray package runnable under `go test` without needing a real notification area.
- [x] 2.3 GREEN — Create `resources/tray-icon.ico` as the embedded tray asset and expose its bytes from the tray package (for example via `internal/tray/icon_windows.go`) so runtime lookup is not required.
- [x] 2.4 GREEN — Create `internal/tray/systray_manager.go` with the real `getentsystray/systray` implementation, external loop startup, click handling for `"Abrir"`/`"Salir"`, tooltip/icon setup, and graceful `Quit()` teardown.
- [x] 2.5 REFACTOR — Keep systray menu/event primitives injectable inside `internal/tray` so adapter tests stay deterministic and avoid OS-shell coupling.

## Phase 3: Callback Wiring / Verification

- [x] 3.1 RED — Extend `app_test.go` with failing callback tests proving tray `OnOpen` shows/focuses the existing Wails window and tray `OnExit` requests graceful app quit without creating duplicate windows.
- [x] 3.2 GREEN — Finish `app.go` callback wiring so `"Abrir"` delegates to Wails runtime show/focus helpers and `"Salir"` delegates to runtime quit while preserving existing startup/shutdown behavior.
- [x] 3.3 REFACTOR — Narrow runtime-facing helpers in `app.go` so tray lifecycle tests remain stable and readable under strict TDD.
- [x] 3.4 VERIFY — Run `go test ./...` and perform a Windows manual smoke check for the spec scenarios: startup hidden with tray icon, `"Abrir"` shows/focuses, and `"Salir"` exits and removes the icon. (`go test ./...` all green; manual smoke check deferred — requires a physical Windows session with tray area accessible.)
