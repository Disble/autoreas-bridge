# Verify Report: SDD-13 System Tray

**Change**: sdd-13-system-tray
**Date**: 2026-04-08
**Verified by**: orchestrator

### Verdict
PASS

---

## Spec Coverage

### R1: Tray Initialization on Startup
- ✅ `app.go:215-227`: `a.trayManager.Start(Config{Icon, Tooltip, OnOpen, OnExit})` called in `startup()` before DB bootstrap
- ✅ `app.go:226`: `a.hideWindow(ctx)` called immediately after tray start
- ✅ Test `TestAppStartupStartsTrayManagerWithIconCallbacksAndHide`: verifies `StartCalls==1`, icon bytes non-empty, `OnOpen`/`OnExit` non-nil, `hideWindowCalls==1`
- ⚠️ WARNING (manual): Real notification area visibility requires physical Windows session — not automatable via `go test`

### R2: Context Menu Structure
- ✅ `systray_manager.go:41-42`: `addMenuItem("Abrir", "Abrir la ventana principal")` and `addMenuItem("Salir", "Salir de Autoreas Bridge")`
- ✅ Test `TestSystrayManagerStartConfiguresMenuAndInvokesCallbacks`: verifies `titles[0]=="Abrir"`, `titles[1]=="Salir"`

### R3: "Abrir" Action — shows + focuses window
- ✅ `app.go:333-339`: `openMainWindow()` calls `a.unminimiseWindow(ctx)` then `a.showWindow(ctx)` — covers both "window hidden" and "window already visible" scenarios (WindowShow is idempotent)
- ✅ Test `TestAppTrayOnOpenShowsAndUnminimisesWindow`: verifies `showWindowCalls==1`, `unminimiseWindowCalls==1`, no duplicate window

### R4: "Salir" Action — graceful shutdown
- ✅ `app.go:341-346`: `requestQuit()` calls `a.quitApp(ctx)` → `wruntime.Quit`
- ✅ Test `TestAppTrayOnExitRequestsQuit`: verifies `quitCalls==1`, `showWindowCalls==0`
- ⚠️ WARNING (manual): "Salir during active sync" scenario (SHOULD log interruption) is not unit-tested — logging is implicit via existing tracer bullet infrastructure; acceptable per design

### R5: Tray Cleanup on Shutdown
- ✅ `app.go:309-311`: `a.trayManager.Stop()` called in `shutdown()`
- ✅ Test `TestAppShutdownStopsTrayManager`: verifies `StopCalls==1`
- ✅ `SystrayManager.Stop()` uses `sync.Once` — idempotent, no double-quit
- ✅ Test `TestSystrayManagerStopIsIdempotent`: verifies `quitCalls==1` on two `Stop()` calls

## Tasks Coverage

| Task | Status |
|------|--------|
| 1.1 RED | ✅ |
| 1.2 GREEN | ✅ |
| 1.3 GREEN | ✅ |
| 1.4 REFACTOR | ✅ |
| 2.1 RED | ✅ |
| 2.2 GREEN | ✅ |
| 2.3 GREEN | ✅ |
| 2.4 GREEN | ✅ |
| 2.5 REFACTOR | ✅ |
| 3.1 RED | ✅ |
| 3.2 GREEN | ✅ |
| 3.3 REFACTOR | ✅ |
| 3.4 VERIFY | ✅ (`go test ./...` all green; manual smoke deferred) |

All 13 tasks complete and checked.

## Test Results

```
go test ./... -count=1
ok  autoreas-bridge              0.241s
ok  autoreas-bridge/internal/anime
ok  autoreas-bridge/internal/anime/domain
ok  autoreas-bridge/internal/api
ok  autoreas-bridge/internal/api/handlers
ok  autoreas-bridge/internal/device
ok  autoreas-bridge/internal/events
ok  autoreas-bridge/internal/realtime
ok  autoreas-bridge/internal/sync
ok  autoreas-bridge/internal/tracerbullet
ok  autoreas-bridge/internal/tray
```

`go vet ./...` — no issues.

## Deviations from Design

| Deviation | Impact | Assessment |
|-----------|--------|------------|
| Used `github.com/getlantern/systray` instead of `github.com/getentsystray/systray` | Low — same API surface, CGO-backed on Windows, injectable seams for tests | Acceptable; both libs use identical `systray.*` function names |
| Icon embedded in `internal/tray/tray-icon.ico` instead of `resources/tray-icon.ico` | Low — both files exist; the embed path is internal | Acceptable; icon is still embedded and available |
| `startup()` fallback for `newTrayManager` returns `nil` (not `NewSystrayManager()`) | Low — `NewApp()` correctly injects real manager; `&App{}` manual test construction stays side-effect free | Correct design: `NewApp()` is the composition root |

## Warnings

- **PASS WITH WARNINGS**: Two spec scenarios require manual Windows validation (tray icon visible in notification area; "Salir" during active sync). These cross the OS-shell boundary and are intentionally excluded from automated tests per design.md.
