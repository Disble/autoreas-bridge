# Proposal: System Tray Integration

## Intent

Implement a system tray icon with a context menu ("Abrir", "Salir") so the application can run in the background hidden from the taskbar, while still being accessible to the user.

## Scope

### In Scope
- Add system tray icon using `github.com/getentsystray/systray`
- Context menu with "Abrir" to show window and "Salir" to close app
- Embed an `.ico` asset for the tray icon
- Hide application on startup, running only in the system tray

### Out of Scope
- Cross-platform system tray support (Windows only)
- Dynamic tray icon updates (e.g. status indicators)
- Additional menu options beyond Open/Exit

## Approach

Use the `getentsystray/systray` library which provides a CGO-free implementation on Windows. Initialize the tray via `systray.RunWithExternalLoop(onReady, onExit)` in the Wails `app.go startup()` lifecycle method. Use a goroutine to handle menu events. Shutdown cleanly via `systray.Quit()` in `app.go shutdown()`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app.go` | Modified | Add tray initialization in `startup()` and cleanup in `shutdown()` |
| `go.mod` / `go.sum` | Modified | Add `github.com/getentsystray/systray` dependency |
| `resources/tray-icon.ico` | New | Embedded icon asset for the system tray |
| `app_test.go` | Modified | TDD tests for tray lifecycle and menu callbacks |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CGO dependency on Windows | Low | Verify `getentsystray/systray` uses `win32/go-ole` without requiring GCC |
| Icon format incompatibility | Low | Ensure the embedded icon is a valid `.ico` file |

## Rollback Plan

Revert `app.go` changes, remove `tray-icon.ico`, and run `go mod tidy` to drop the `systray` dependency.

## Dependencies

- `github.com/getentsystray/systray`

## Success Criteria

- [ ] App starts hidden, but tray icon is visible in Windows notification area.
- [ ] Clicking "Abrir" shows the main window.
- [ ] Clicking "Salir" cleanly exits the process.
- [ ] Existing tests pass.