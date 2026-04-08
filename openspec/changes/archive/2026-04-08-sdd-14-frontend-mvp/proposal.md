# Proposal: sdd-14-frontend-mvp

## Intent
Build the MVP React UI for `autoreas-bridge` that displays internal status and provides mobile connection details (IP + QR Code), while establishing a maintainable frontend baseline with pinned dependencies and ESLint.

## Scope

### In Scope
- Pin all `frontend/package.json` dependencies (exact versions).
- Configure ESLint (v8.x) for React/TS.
- Add `react-qr-code` dependency.
- Create Wails Go bindings: `GetPairingToken() string` and `GetSQLiteStatus() string`.
- Build React components: `BridgeStatus.tsx` and `PairingPanel.tsx`.
- Display QR code with payload `http://{IP:port}`.

### Out of Scope
- Full frontend test suite or test runner setup.
- Advanced mobile app connection logic beyond providing the URL.
- Migration to ESLint v9 (flat config).

## Approach
1. **Tooling**: Update `package.json` to pin versions, add ESLint 8.x + React hooks/TS plugins, and add a `lint` script. Create `.eslintrc.cjs`.
2. **Go Bindings**: Add `GetPairingToken` (uses `device.Store.SavePairingToken`) and `GetSQLiteStatus` to `app.go`. Handle nil DB gracefully.
3. **UI Implementation**: Refactor `App.tsx` to use new `BridgeStatus` and `PairingPanel` components. The pairing panel will render a QR code with the raw local IP and port.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | Pin versions, add ESLint deps, `react-qr-code`, `lint` script |
| `frontend/.eslintrc.cjs` | New | ESLint 8.x configuration |
| `frontend/src/App.tsx` | Modified | Refactor into two main panels |
| `frontend/src/components/*` | New | `BridgeStatus.tsx` and `PairingPanel.tsx` |
| `app.go` & `app_test.go` | Modified | Add `GetPairingToken` and `GetSQLiteStatus` with TDD |
| `frontend/wailsjs/*` | Modified | Auto-generated TS bindings |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ESLint v9 compatibility issues | Medium | Explicitly install ESLint 8.x to match Vite 3 stack |
| DB nil when generating token | Low | Handle nil gracefully in `GetPairingToken` |
| QR payload format mismatch | Low | Keep payload simple (`http://IP:port`) for now |

## Rollback Plan
Revert changes to `frontend/package.json` and delete the added files/components. Revert Go modifications in `app.go`.

## Dependencies
- Mobile app expecting HTTP connection over the local network.
- Existing TS 4.6 + Vite 3 setup.

## Success Criteria
- [ ] UI compiles clean and `npm run lint` passes without errors.
- [ ] UI displays SQLite internal state (`ok` or error).
- [ ] UI displays raw network IP and a scanable QR code.
- [ ] `GetPairingToken` creates and persists a token via `device.Store`.