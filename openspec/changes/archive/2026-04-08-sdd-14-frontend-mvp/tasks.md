# Tasks: sdd-14-frontend-mvp

## Phase 1: Go Bindings — TDD (RED)

- [x] 1.1 In `app_test.go`, add failing test for `GetSQLiteStatus()` — nil `bridgeDB` → returns non-"ok" string
- [x] 1.2 In `app_test.go`, add failing test for `GetSQLiteStatus()` — initialized `bridgeDB` → returns `"ok"`
- [x] 1.3 In `app_test.go`, add failing test for `GetPairingToken()` — nil store → returns error string (not empty, not a 32-char hex)
- [x] 1.4 In `app_test.go`, add failing test for `GetPairingToken()` — stub store happy path → returns 32-char hex token and persists via `SavePairingToken`

## Phase 2: Go Bindings — GREEN

- [x] 2.1 Add `GetSQLiteStatus() string` to `app.go` — returns `"db unavailable"` if `bridgeDB == nil`, else pings via `bridgeDB.PingContext(ctx, ...)` and returns `"ok"` or `err.Error()`
- [x] 2.2 Add `GetPairingToken() string` to `app.go` — if store is nil returns error string; generates 32-char hex token via `crypto/rand`, calls `store.SavePairingToken(ctx, token, nowMs)`, returns token or error string
- [x] 2.3 Run `go test ./...` — all tests MUST pass

## Phase 3: Go Bindings — REFACTOR

- [x] 3.1 Extract token generation into a `newToken func() (string, error)` field on `App` struct (injectable for tests, matches existing `device.Service` pattern)
- [x] 3.2 Run `go test ./...` — confirm tests still pass after refactor

## Phase 4: Frontend Baseline

- [x] 4.1 Update `frontend/package.json` — pin exact versions for all deps; add `react-qr-code`, ESLint 8.x + plugins (`eslint-plugin-react`, `eslint-plugin-react-hooks`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`); add `"lint": "eslint src --ext ts,tsx"` script
- [x] 4.2 Create `frontend/.eslintrc.cjs` with ESLint 8.x config for React 18 + TS 4.6
- [x] 4.3 Fix `frontend/src/style.css` — change `#app` selector to `#App`

## Phase 5: Wails Bindings (Manual Sync)

- [x] 5.1 Update `frontend/wailsjs/go/main/App.d.ts` — add `GetSQLiteStatus` and `GetPairingToken` TS declarations
- [x] 5.2 Update `frontend/wailsjs/go/main/App.js` — add corresponding JS stubs

## Phase 6: React Components

- [x] 6.1 Create `frontend/src/components/BridgeStatus.tsx` — calls `GetSQLiteStatus()` on mount, displays result
- [x] 6.2 Create `frontend/src/components/PairingPanel.tsx` — calls `GetEffectiveAddress()` for IP:port split, renders QR code (`react-qr-code`) encoding `http://{ip}:{port}`, calls `GetPairingToken()`, shows copyable token
- [x] 6.3 Refactor `frontend/src/App.tsx` — replace inline status/address display with `<BridgeStatus />` and `<PairingPanel />`; keep `TriggerReconcile` button
