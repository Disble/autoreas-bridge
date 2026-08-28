# Wails Bindings & Lifecycle Specification

## Purpose

This spec covers the Wails application lifecycle configuration and the minimal Go-to-React binding surface that enables the frontend to communicate with the bridge's core services without binding internal infrastructure objects directly.

---

## Requirements

### Requirement: Window Close Must Not Terminate Process

The Wails application MUST be configured with `HideWindowOnClose: true` so that closing the OS window hides it rather than terminating the Go process.

#### Scenario: User closes the Wails window

- GIVEN the Wails application is running
- WHEN the user clicks the window's close button
- THEN the window is hidden
- AND the Go process continues executing in the background
- AND all services (HTTP server, watcher, hub) remain active

#### Scenario: Process can still be terminated explicitly

- GIVEN the window is hidden
- WHEN the OS or tray (SDD-13) sends a quit/exit signal
- THEN `app.shutdown(ctx)` is called and all services stop cleanly

---

### Requirement: App Facade Stores Service References

`App` MUST store references to `*sync.TriggerService` and `*api.Server` as fields during `startup()` so that Wails-bound public methods can delegate to them.

#### Scenario: Startup completes successfully

- GIVEN the application starts
- WHEN `app.startup(ctx)` finishes
- THEN `app.syncTrigger` holds a valid `*sync.TriggerService`
- AND `app.httpServer` holds a valid `*api.Server`

#### Scenario: Method called before startup (nil guard)

- GIVEN the Go runtime has not yet called `startup()`
- WHEN a Wails binding method is invoked from the frontend
- THEN the method returns an error string or empty value
- AND the Go process does NOT panic

---

### Requirement: TriggerReconcile Binding

`App` MUST expose a public method `TriggerReconcile() string` that delegates to `sync.TriggerService.TriggerReconcile(ctx)` and returns `"ok"` on success or an error description string on failure.

#### Scenario: Reconcile triggered successfully

- GIVEN the bridge is running and a device is connected
- WHEN the React frontend calls `window.go.main.App.TriggerReconcile()`
- THEN the method publishes a `SyncRequestedEvent` via the internal event bus
- AND returns `"ok"`

#### Scenario: Reconcile called when service unavailable

- GIVEN `app.syncTrigger` is nil (startup failed)
- WHEN the React frontend calls `TriggerReconcile()`
- THEN the method returns a non-empty error string
- AND does NOT panic

---

### Requirement: GetEffectiveAddress Binding

`App` MUST expose `GetEffectiveAddress() string` that returns the local LAN address (e.g., `192.168.1.5:9876`) from `api.Server.EffectiveAddress()`.

#### Scenario: Address retrieved after startup

- GIVEN the HTTP server is listening
- WHEN the React frontend calls `GetEffectiveAddress()`
- THEN it returns a non-empty string of the form `{IP}:{port}`

#### Scenario: Address retrieved before startup

- GIVEN the HTTP server is not yet initialized
- WHEN `GetEffectiveAddress()` is called
- THEN it returns an empty string `""`
- AND does NOT panic

---

### Requirement: GetBridgeStatus Binding

`App` MUST expose `GetBridgeStatus() string` that returns `"ok"` when all services started successfully, or an error message if `startupErr` is set.

#### Scenario: All services healthy

- GIVEN startup completed without errors
- WHEN React calls `GetBridgeStatus()`
- THEN the method returns `"ok"`

#### Scenario: Startup failed

- GIVEN `startup()` encountered a fatal error stored in `app.startupErr`
- WHEN React calls `GetBridgeStatus()`
- THEN the method returns a non-empty error string describing the failure

---

### Requirement: Frontend Consumes New Bindings

The React `App.tsx` MUST be updated to consume `TriggerReconcile`, `GetEffectiveAddress`, and `GetBridgeStatus` from the generated Wails bindings instead of the starter `Greet` demo.

#### Scenario: Bridge status displayed on mount

- GIVEN the app is rendered in the Wails WebView
- WHEN the component mounts
- THEN it calls `GetBridgeStatus()` and displays the result
- AND it calls `GetEffectiveAddress()` and displays the IP:port

#### Scenario: Reconcile button triggers sync

- GIVEN the status is "ok"
- WHEN the user clicks the "Trigger Sync" button
- THEN `TriggerReconcile()` is called
- AND the UI updates to show success or error feedback
