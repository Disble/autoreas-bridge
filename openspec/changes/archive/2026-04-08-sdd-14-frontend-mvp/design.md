# Design: sdd-14-frontend-mvp

## Technical Approach

Extend `app.go` with two new Wails bindings (`GetSQLiteStatus`, `GetPairingToken`) using strict TDD (RED → GREEN → REFACTOR), then build two React components (`BridgeStatus`, `PairingPanel`) that consume them. Establish a stable frontend baseline by pinning exact package versions and configuring ESLint 8.x.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Token generation in `app.go` | `crypto/rand` hex token inline (same as existing `randomHexToken`) | Reuse `device.Service` | `device.Service.PairDevice` requires a device name and consumes the token — wrong lifecycle. `app.go` must generate and persist independently via `device.Store.SavePairingToken`. |
| ESLint version | 8.x + `.eslintrc.cjs` | 9.x flat config | Vite 3 and TS 4.6 ship plugins incompatible with ESLint 9 flat config. Explicit version lock prevents accidental upgrades. |
| QR library | `react-qr-code` | `qrcode.react` | SVG-based, zero canvas deps, consistent with Vite 3 + React 18 build pipeline. |
| Wails bindings (manual) | Manual update of `App.d.ts` and `App.js` | `wails generate module` | No build step allowed (`wails build` is forbidden). Manual sync matches established pattern from SDD-12. |
| CSS selector mismatch | Fix `style.css` `#app` → `#App` | Leave broken | Root element is `id="App"` in `App.tsx`; selector mismatch causes broken global styles. |

## Data Flow

```
[React: PairingPanel]
   │  mount
   ├─→ GetEffectiveAddress() → "192.168.x.x:8080"
   │       → split IP:port → display + build QR URL "http://ip:port"
   └─→ GetPairingToken()
           → crypto/rand hex (32 chars)
           → device.Store.SavePairingToken(ctx, token, nowMs)
           → return token string

[React: BridgeStatus]
   │  mount
   └─→ GetSQLiteStatus()
           → if bridgeDB == nil → return "db unavailable"
           → else → ping (db.PingContext) → "ok" or err.Error()
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app.go` | Modify | Add `GetSQLiteStatus()` and `GetPairingToken()` methods |
| `app_test.go` | Modify | TDD unit tests for the two new methods |
| `frontend/package.json` | Modify | Pin exact versions; add `react-qr-code`, ESLint 8.x deps; add `lint` script |
| `frontend/.eslintrc.cjs` | Create | ESLint 8.x config with React hooks + TS rules |
| `frontend/src/style.css` | Modify | Fix `#app` → `#App` selector |
| `frontend/src/App.tsx` | Modify | Refactor to compose `BridgeStatus` + `PairingPanel` |
| `frontend/src/components/BridgeStatus.tsx` | Create | Displays SQLite status from `GetSQLiteStatus` |
| `frontend/src/components/PairingPanel.tsx` | Create | Displays IP, QR code, and copyable token |
| `frontend/wailsjs/go/main/App.d.ts` | Modify | Add `GetSQLiteStatus` and `GetPairingToken` TS declarations |
| `frontend/wailsjs/go/main/App.js` | Modify | Add corresponding JS stubs |

## Interfaces / Contracts

```go
// app.go — new methods

// GetSQLiteStatus returns "ok" if the bridge DB is initialized and reachable,
// or an error string if nil or unreachable.
func (a *App) GetSQLiteStatus() string

// GetPairingToken generates a 32-char hex token, persists it via device.Store,
// and returns it. Returns an error string if DB or store is nil.
func (a *App) GetPairingToken() string
```

```ts
// App.d.ts additions
export function GetSQLiteStatus(): Promise<string>;
export function GetPairingToken(): Promise<string>;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Go unit | `GetSQLiteStatus` nil/ok/ping-error paths | Table-driven tests in `app_test.go`; inject `bridgeDB` field directly |
| Go unit | `GetPairingToken` nil-store path + happy path | Stub `newDeviceStore` returning a spy; assert token format (32 hex chars) |
| Frontend | `BridgeStatus` + `PairingPanel` rendering | No test runner — verified visually via `npm run dev` and lint gate |

## Migration / Rollout

No migration required. Token persistence uses the existing `device_pairing_tokens` table bootstrapped in SDD-12.

## Open Questions

- None. All decisions are resolved.
