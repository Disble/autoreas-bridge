# Tasks: SDD-31 Season Mode (Foundation)

> Change: 2026-06-29-sdd-31-season-mode · Artifact store: hybrid · Strict TDD active

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 Go (PR1) · ~280 frontend (PR2) |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1: Go backend → PR2: Frontend |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DDL + preferences context + Wails bindings | PR1 | Base: main; all Go tests green before merge |
| 2 | Source + store + panel + route + nav | PR2 | Base: main after PR1; gated on `wails generate module` |

---

## Slice 1: Go Backend (PR1)

### Phase 1 — Schema + Domain

- [x] 1.1 [RED] Create `internal/preferences/sqlite_store_test.go`: round-trip true/false, missing-row → false, upsert overwrites, idempotent DDL. Use real temp `bridge.db` via `t.TempDir()`. Never touch `resources/*.dat`.
- [x] 1.2 Create `internal/preferences/preferences.go`: `Store` interface (`SeasonMode(ctx)(bool,error)`, `SetSeasonMode(ctx,bool)error`) + `seasonModeKey = "season_mode"` const.
- [x] 1.3 Create `internal/sync/sqlite_bootstrap_preferences.go` (package sync): `appSettingsDDL` const + `ensureAppSettingsSchema(db *sql.DB) error` with `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
- [x] 1.4 [GREEN] Create `internal/preferences/sqlite_store.go`: `SQLiteStore` + `NewSQLiteStore(db *sql.DB)`; facade methods; private `getString`/`setString` KV helpers; bool encoded as `"true"`/`"false"`; `sql.ErrNoRows` → `(false, nil)`. All 1.1 tests pass.
- [x] 1.5 Modify `internal/sync/sqlite_bootstrap.go`: one `ensureAppSettingsSchema(db)` call inside `initializeBridgeDB()`. No other changes to this file.

### Phase 2 — Bindings + App Wiring

- [x] 2.1 [RED] Create `app_preferences_test.go`: nil store → `false` / `"preferences store unavailable"` (no panic); wired `SetSeasonMode` returns `"ok"`; round-trip via injected fake `preferences.Store`.
- [x] 2.2 [GREEN] Create `app_preferences.go`: `GetSeasonMode() bool` (nil/err → false, never panics), `SetSeasonMode(enabled bool) string` (`"ok"` / `"preferences store unavailable"` / `err.Error()`), `preferencesCtx()` (mirrors `downloadCtx()`). All 2.1 tests pass.
- [x] 2.3 Modify `app.go`: add fields `newPreferencesStore func(*sql.DB) preferences.Store` + `preferencesStore preferences.Store`; wire `preferencesStore` in `startup()` after `bridgeDB` non-nil (mirror `deviceStore` pattern at L137–138).
- [x] 2.4 Modify `app_defaults.go`: add `a.newPreferencesStore = func(db *sql.DB) preferences.Store { return preferences.NewSQLiteStore(db) }` in `ensureRuntimeDependencies()`.

### Phase 3 — Go Verification + Regen Gate

- [x] 3.1 Run `go test ./...` — adapter + binding tests green, no regressions.
- [x] 3.2 Run `go vet ./...` + `golangci-lint run` — clean.
- [x] 3.3 Run `go run ./tools/checkgofilesize` — `baseline.yaml` stays empty; no file over 500 effective lines.
- [x] 3.4 **GATE (blocks Slice 2)** Run `wails generate module` — regenerates `frontend/wailsjs/**`. Commit skipped (orchestrator commits). PR2 now unblocked.

---

## Slice 2: Frontend (PR2 — gated on 3.4)

### Phase 4 — Scaffold + Source + Store

- [x] 4.1 Run `bun --cwd=frontend run generate:feature preferences SeasonModePanel` to scaffold colocated module skeleton.
- [x] 4.2 [RED] Create `frontend/src/shared/store/__tests__/preferences-store.test.ts`: `refresh` sets `seasonMode`/`hasLoaded`; error path sets `errorMessage`; `resetPreferencesStore` clears all state.
- [x] 4.3 [GREEN] Create `frontend/src/infrastructure/preferences-source.ts`: `waitForBindings` singleton (mirrors `download-runtime-source.ts`); safe default `false`.
- [x] 4.4 [GREEN] Create `frontend/src/shared/store/preferences-store.ts`: `usePreferencesStore` (load-once, `refresh`, `setSeasonMode`) + `resetPreferencesStore` test seam. All 4.2 tests pass.

### Phase 5 — SeasonModePanel Module

- [x] 5.1 [RED] Create `features/preferences/ui/SeasonModePanel/__tests__/season-mode-panel.helpers.test.ts`: `false → "Desactivado"`, `true → "Activado"`.
- [x] 5.2 [GREEN] Implement `season-mode-panel.helpers.ts`: exported `getSeasonModeLabel(enabled: boolean): string` with JSDoc. All 5.1 tests pass.
- [x] 5.3 [RED] Create `__tests__/use-season-mode-panel.test.ts`: mount triggers `refresh` exactly once; toggle calls `setSeasonMode` and updates label; error reverts value without crash.
- [x] 5.4 [GREEN] Implement `use-season-mode-panel.ts`: strict hook anatomy; `useEffect` for mount-load (calls `refresh`); toggle handler calls `setSeasonMode`. All 5.3 tests pass.
- [x] 5.5 [RED] Create `__tests__/SeasonModePanel.test.tsx`: renders HeroUI toggle + `"Ver animes se abre con la sección de Estrenos desplegada en Ver hoy."` helper text; reflects `enabled`/`isLoading`/`errorMessage` props; asserts no direct Wails or store calls from component.
- [x] 5.6 [GREEN] Implement `SeasonModePanel.tsx` (HeroUI v3 + Tailwind, props-only, no `useEffect`, calls single colocated hook); `SeasonModePanel.types.ts` (all props `readonly`); `SeasonModePanel.constants.ts`; `index.ts`. All 5.5 tests pass.

### Phase 6 — Route + Nav

- [x] 6.1 Create `frontend/src/app/routes/PreferencesRoute.tsx`: composition-only; renders `SeasonModePanel` inside a `Card` (mirror `DownloadsRoute`). No state, no effects, no Wails calls.
- [x] 6.2 Modify `frontend/src/app/AppLayout.tsx`: append `{ to: '/preferences', label: 'Opciones', Icon: OptionsIcon }` to `NAV_ITEMS`; add `OptionsIcon` import/definition.
- [x] 6.3 Modify `frontend/src/App.tsx`: add `<Route path="/preferences" element={<PreferencesRoute />} />`. Composition only — no hooks, no state.

### Phase 7 — Frontend Verification

- [x] 7.1 Run `bun --cwd=frontend run test` — all vitest (store, helpers, hook, panel) pass.
- [x] 7.2 Run `bun --cwd=frontend run validate` — typecheck + ESLint + filesize clean; no file over 500 effective lines.
