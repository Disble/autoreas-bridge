## Exploration: SDD-14 Frontend MVP (React)

### Current State
- `frontend/src/App.tsx` is still the minimal SDD-12 panel: it mounts, calls `GetBridgeStatus()` and `GetEffectiveAddress()`, shows `Status`, `LAN Address`, and a `Trigger Sync` button. There is NO pairing panel, NO token UI, NO QR, and NO SQLite-specific status in the frontend.
- The current Wails binding surface in `frontend/wailsjs/go/main/App.d.ts` only exposes `GetBridgeStatus`, `GetEffectiveAddress`, and `TriggerReconcile`. `GetEffectiveAddress()` returns `IP:port`, not a pairing payload or WebSocket URL. There is no binding for pairing token issuance, QR payload generation, or SQLite diagnostics.
- `GetBridgeStatus()` in `app.go` only returns `"ok"` or `startupErr.Error()`. That is startup health, not “internal SQLite state”. If SDD-14 success requires explicit SQLite state in the UI, the current backend contract is insufficient.
- `frontend/package.json` is still scaffold-level: exact versions are NOT pinned (`^` everywhere), there is NO ESLint dependency, NO lint script, NO test script, and NO QR library installed.
- Frontend structure is tiny: `src/App.tsx`, `src/main.tsx`, `src/App.css`, `src/style.css`, and assets only. There is no `src/components/` directory yet.
- ESLint is completely absent: no `frontend/.eslintrc*`, no `frontend/eslint.config.*`, and no eslint-related packages in `package.json`.
- Build/tooling exists but is minimal: `vite.config.ts`, `tsconfig.json`, and `tsconfig.node.json` are present; there is no Vitest/Jest setup under `frontend/`.
- Small UI drift already exists: both CSS files target `#app`, while `App.tsx` renders `<div id="App">`, so the scaffold root selector likely does not apply as intended.
- Pairing backend capability is incomplete for the MVP screen: the API already supports `POST /api/devices/pair`, and SQLite already has `pairing_tokens` / `devices` tables, but there is no current Wails-facing method to issue or expose a pairing token for the desktop UI.
- The change folder `openspec/changes/sdd-14-frontend-mvp/` did not exist before this exploration, so there are currently no proposal/spec/design/tasks artifacts for this change yet.

### Affected Areas
- `frontend/package.json` — pin exact versions, add eslint stack, add QR dependency, and add lint script(s).
- `frontend/src/App.tsx` — replace the minimal SDD-12 panel with an MVP layout that shows bridge status, SQLite state, raw local IP, and pairing QR/token.
- `frontend/src/App.css` — replace scaffold/demo styling with pairing/status card styling.
- `frontend/src/style.css` — keep global styles aligned with the real root id/structure.
- `frontend/src/components/*` — likely new presentational components for status and pairing panels if we split the screen.
- `frontend/wailsjs/go/main/App.d.ts` and `frontend/wailsjs/go/main/App.js` — generated binding stubs must grow if new Wails methods are added for token/SQLite info.
- `app.go` — must expose additional Wails facade methods if frontend needs pairing token issuance and explicit SQLite status.
- `internal/device/service.go` — likely needs an app-facing token issuance use case because pairing currently only consumes tokens; it does not expose “generate token for desktop UI”.
- `internal/api/server.go` / related services — relevant only if SDD-14 chooses to surface richer pairing data from existing services rather than hardcoding frontend-only formatting.
- `openspec/changes/sdd-14-frontend-mvp/exploration.md` — created for hybrid SDD persistence; next phases must add proposal/spec/design/tasks.

### Approaches
1. **Keep the frontend thin and extend Wails facade with explicit pairing/status methods** — add small backend-facing Wails methods such as `GetBridgeStatus`, `GetEffectiveAddress`, `GetSQLiteStatus`, and `IssuePairingToken`, then let React compose the screen from those primitives.
   - Pros: keeps React simple, respects the existing `App` facade pattern from SDD-12, and gives the UI exactly the data it needs without leaking internal details through ad hoc parsing.
   - Cons: SDD-14 stops being “frontend only”; it requires backend/Wails additions for token issuance and SQLite state.
   - Effort: Medium

2. **Frontend-only refresh of the current panel** — keep existing bindings, add a QR library, and render the current `IP:port` plus static/explanatory text around it.
   - Pros: fastest UI-only path.
   - Cons: does NOT satisfy the full slice because there is still no token source, no explicit SQLite state, and no dedicated raw-IP pairing contract.
   - Effort: Low

3. **Single composite Wails binding for pairing view model** — add one new method that returns a full DTO with status, effective address, raw IP, SQLite health, and pairing token/URL payload.
   - Pros: minimal frontend orchestration and fewer async calls.
   - Cons: heavier backend contract, less incremental, and less reusable if future screens need independent pieces.
   - Effort: Medium

### Recommendation
Use **Approach 1: thin React + explicit Wails facade extensions**.

For the frontend:
- Create a small screen composed of two cards/panels: **Bridge/SQLite Status** and **Mobile Pairing**.
- Split the current `GetEffectiveAddress()` result into `rawIp` and `port` in the UI only if backend keeps returning `IP:port`; display the **raw IP prominently** and the port/URL as secondary detail.
- Add a QR component rather than rolling SVG/math manually.

For the QR library:
- Prefer **`react-qr-code`** for the MVP.
- Why: tiny surface area, straightforward React rendering, no need for canvas APIs, and enough for “render one connection QR” without overengineering.
- `qrcode.react` is also viable, but it brings more surface/options than this slice needs. Building the string and showing only a text link is too weak because the spec explicitly calls for **QR/Token** in the pairing screen.

For backend/Wails support:
- Add a Wails method to expose **explicit SQLite status** because `GetBridgeStatus()` alone is not the SQLite state.
- Add a Wails method/use case to **issue or fetch a pairing token**; today the backend can validate/consume tokens, but the desktop UI has no way to generate one for the user.
- Keep the Wails facade granular rather than returning one huge blob unless proposal/design finds a compelling reason to collapse it.

### Risks
- **Biggest gap:** current backend contract does not expose pairing token generation, so the frontend cannot honestly render “QR/Token” yet.
- **SQLite wording risk:** the success criterion says the UI must show “estado interno de SQLite”, but current bindings only expose app startup health. Proposal/spec must define whether that means `ok/error`, DB path, connection state, or richer diagnostics.
- **Version pinning risk:** `frontend/package.json` uses caret ranges everywhere, so SDD-14 must intentionally rewrite all deps/devDeps to exact versions and likely commit a lockfile strategy decision.
- **ESLint bootstrapping risk:** adding ESLint to an older stack (`React 18 + Vite 3 + TS 4.6`) may require choosing plugin versions carefully instead of blindly installing latest packages.
- **QR payload ambiguity:** the repo currently exposes `IP:port`, not a canonical mobile connection URL. Proposal/spec should define exactly what the QR encodes (raw host+port, HTTP base URL, WS URL, or pairing URL/token bundle).
- **UI drift risk:** current CSS still reflects starter scaffold assumptions (`#app` vs `#App`), so a superficial component addition could leave the MVP visually broken if styles are not cleaned up deliberately.
- **Change-artifact risk:** this exploration is now persisted, but the rest of `openspec/changes/sdd-14-frontend-mvp/` is still missing and must be created in subsequent SDD phases.

### Ready for Proposal
Yes — the codebase is clear enough to propose SDD-14 as a combined **frontend + Wails facade** slice. The proposal should explicitly settle two contracts before implementation: (1) what exact SQLite state must be displayed, and (2) what exact payload the pairing QR encodes.
