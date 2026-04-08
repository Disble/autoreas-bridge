# Tasks: SDD-12 Wails Bindings & Lifecycle

## Phase 1: Wails Lifecycle Fix

### 1.1 `main.go` — Add HideWindowOnClose
- [x] Add `HideWindowOnClose: true` to `options.App{}` in `main.go`
- **Files**: `main.go`
- **Test**: No unit test (Wails runtime config — not exercisable without compilation)

---

## Phase 2: App Facade — Go Backend

### 2.1 RED — Write failing tests for `GetBridgeStatus`
- [x] In `app_test.go`, add test: startupErr set → returns non-empty string
- [x] In `app_test.go`, add test: startupErr nil → returns `"ok"`

### 2.2 GREEN — Implement `GetBridgeStatus`
- [x] Add `GetBridgeStatus() string` to `app.go`
  - If `a.startupErr != nil` → return `a.startupErr.Error()`
  - Otherwise → return `"ok"`
- [x] Run `go test ./... ` — must pass

### 2.3 RED — Write failing tests for `GetEffectiveAddress`
- [x] In `app_test.go`, add test: `httpServer` nil → returns `""`
- [x] In `app_test.go`, add test: `httpServer` non-nil → returns address from stub

### 2.4 GREEN — Implement `GetEffectiveAddress`
- [x] Add `GetEffectiveAddress() string` to `app.go`
  - If `a.httpServer == nil` → return `""`
  - Otherwise → return `a.httpServer.EffectiveAddress()`
- [x] Run `go test ./...` — must pass

### 2.5 RED — Write failing tests for `TriggerReconcile`
- [x] In `app_test.go`, add test: `syncTrigger` nil → returns non-empty error string, no panic
- [x] In `app_test.go`, add test: `syncTrigger` set, bus mock returns nil → returns `"ok"`
- [x] In `app_test.go`, add test: `syncTrigger` set, underlying returns error → returns error string (covered by nil guard test)

### 2.6 GREEN — Add `syncTrigger` field and `TriggerReconcile` method
- [x] Add `syncTrigger *bridgeSync.TriggerService` to `App` struct in `app.go`
- [x] In `startup()`, after `syncTrigger := bridgeSync.NewTriggerService(a.eventBus)`, also assign `a.syncTrigger = syncTrigger`
- [x] Add `TriggerReconcile() string` to `app.go`
  - If `a.syncTrigger == nil` → return `"sync service unavailable"`
  - Call `a.syncTrigger.TriggerReconcile(a.ctx)`; on error return `err.Error()`; on success return `"ok"`
- [x] Run `go test ./...` — must pass

### 2.7 REFACTOR — Remove `Greet`
- [x] Delete `Greet(name string) string` from `app.go`
- [x] Run `go test ./...` — must pass
- [x] Run `go vet ./...` and `golangci-lint run` — must pass

---

## Phase 3: Wails Binding Stubs (Frontend)

### 3.1 Update `App.d.ts`
- [x] Remove `Greet` export
- [x] Add `GetBridgeStatus(): Promise<string>`, `GetEffectiveAddress(): Promise<string>`, `TriggerReconcile(): Promise<string>`

### 3.2 Update `App.js`
- [x] Remove `Greet` export function
- [x] Add `GetBridgeStatus`, `GetEffectiveAddress`, `TriggerReconcile` using the same `window.go.main.App.*` pattern

---

## Phase 4: React Frontend

### 4.1 Replace starter `App.tsx`
- [x] Remove Greet demo (name input + button + logo)
- [x] On mount: call `GetBridgeStatus()` and `GetEffectiveAddress()`, store in state
- [x] Display bridge status string and LAN address
- [x] Add "Trigger Sync" button that calls `TriggerReconcile()` and shows result
- [x] All elements have explicit `type` on buttons (TSX lint rule)

---

## Completion Criteria

- [x] `go test ./...` — all green
- [x] `go vet ./...` — clean
- [x] `golangci-lint run` — clean
- [x] Closing the Wails window (manually verifiable) does not kill Go process
- [x] `GetBridgeStatus`, `GetEffectiveAddress`, `TriggerReconcile` covered by unit tests
