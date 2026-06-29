# Design: 2026-06-29-sdd-31-season-mode (Modo Temporada — Foundation)

> Engram: `sdd/2026-06-29-sdd-31-season-mode/design`
> Reads: proposal (id 4476) · explore (id 4475). Approach A (KV `app_settings`) selected upstream.

## Technical Approach

Ship a bridge-owned, persisted `seasonMode` boolean as a new hexagonal bounded context
`internal/preferences/` (domain `Store` port + SQLite adapter) backed by a generic KV table
`app_settings`, exposed through nil-safe `app_preferences.go` Wails bindings, and consumed by a
load-once `usePreferencesStore` zustand store + dumb `SeasonModePanel` on a new `/preferences`
route. Every layer mirrors an EXISTING, production-wired bridge pattern (download config): adapter
mirrors `internal/download.SQLiteStore`; bindings mirror `app_download.go`; factory mirrors
`app_defaults.go`; frontend source/store mirror `download-runtime-source.ts` /
`download-runtime-store.ts`. No event bus involvement — season mode is point-in-time state read on
mount, not an event stream (the in-memory bus is irrelevant here; stated explicitly).

## Architecture Decisions

### Decision: Boolean encoding in `app_settings.value` → text `"true"`/`"false"`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| TEXT `"true"`/`"false"` | Self-describing in a generic value column; unambiguous | **CHOSEN** |
| INT-as-text `"1"`/`"0"` | Mimics typed `enabled INTEGER` columns but column is TEXT affinity, so no real affinity win | Rejected |

**Rationale**: the KV `value` column is declared `TEXT NOT NULL` precisely to stay generic across
heterogeneous future settings. Within that column, a canonical `"true"`/`"false"` token is
self-documenting and avoids the "is `0` false-or-unset?" ambiguity. The typed `INTEGER 0/1`
convention of `download_jd_config`/`download_schedule_config` applies to dedicated typed columns,
not to a polymorphic KV value — so consistency is preserved *within the table's own contract*. The
adapter owns encode/decode; the domain only ever sees `bool`.

### Decision: `Store` port = season-mode facade over a private generic KV adapter

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Season-mode facade (`SeasonMode`/`SetSeasonMode`) backed by private `getString`/`setString(key)` | Tight, type-safe public contract; no stringly keys leak to callers; adapter internals stay generic | **CHOSEN** |
| Generic public `GetBool(key)`/`SetBool(key,val)` port | Maximally flexible but pushes key constants + parsing onto every caller; weak contract for SDD-31b | Rejected |

**Rationale**: confirms the proposal's lean. The facade keeps the SDD-31b consumer contract
ergonomic (`preferencesStore.SeasonMode(ctx)` — no key knowledge) while the adapter's private KV
helpers make the NEXT setting (e.g. dark mode) a one-method addition reusing the same table and
helpers — extensible WITHOUT over-engineering a generic public surface now.

### Decision: DDL lives in NEW `internal/sync/sqlite_bootstrap_preferences.go`

`sqlite_bootstrap.go` is already 589 physical lines (over the 500 hard-fail). Adding DDL +
`ensureAppSettingsSchema` there crosses the budget. Put `appSettingsDDL` + `ensureAppSettingsSchema`
in a new same-package (`package sync`) file; `initializeBridgeDB()` gains ONE call. No seeding
function: a missing `season_mode` row IS the default (false), resolved in the adapter read — simpler
than `seedDefaultHosterPriorityIfEmpty`.

## Data Flow

    SeasonModePanel.tsx ─uses─▶ useSeasonModePanel (mount load + toggle)
          │                          │
          │                          ▼
          │                  usePreferencesStore (zustand, load-once)
          │                          │
          │                          ▼
          │                  preferences-source.ts (waitForBindings)
          │                          ▼
          ▼                  Wails App.GetSeasonMode / SetSeasonMode
    (renders seasonMode)            │  (app_preferences.go, nil-safe)
                                     ▼
                          preferences.Store facade
                                     ▼
                          SQLiteStore  ⇄  app_settings (key,value) in bridge.db

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/sync/sqlite_bootstrap_preferences.go` | Create | `appSettingsDDL` const + `ensureAppSettingsSchema(db)` |
| `internal/sync/sqlite_bootstrap.go` | Modify | One `ensureAppSettingsSchema(db)` call in `initializeBridgeDB()` |
| `internal/preferences/preferences.go` | Create | `Store` port interface; `seasonModeKey` const |
| `internal/preferences/sqlite_store.go` | Create | `SQLiteStore` + `NewSQLiteStore(db)`; facade + private KV upsert/read |
| `internal/preferences/sqlite_store_test.go` | Create | RED unit tests vs real temp `bridge.db` |
| `app.go` | Modify | Add `newPreferencesStore func(*sql.DB) preferences.Store` + `preferencesStore preferences.Store` fields; wire at startup after `bridgeDB` is non-nil |
| `app_defaults.go` | Modify | Default `newPreferencesStore` in `ensureRuntimeDependencies()` |
| `app_preferences.go` | Create | `GetSeasonMode() bool`, `SetSeasonMode(enabled bool) string`, `preferencesCtx()` |
| `app_preferences_test.go` | Create | RED binding-level nil-store + round-trip tests |
| `frontend/src/infrastructure/preferences-source.ts` | Create | `waitForBindings` singleton source; default false |
| `frontend/src/shared/store/preferences-store.ts` | Create | `usePreferencesStore` + `resetPreferencesStore` |
| `frontend/src/features/preferences/ui/SeasonModePanel/*` | Create | Colocated module (generated) |
| `frontend/src/app/routes/PreferencesRoute.tsx` | Create | Composes panel in a `Card` (mirror `DownloadsRoute`) |
| `frontend/src/app/AppLayout.tsx` | Modify | Add `{ to: '/preferences', label: 'Opciones', Icon: OptionsIcon }` to `NAV_ITEMS` |
| `frontend/src/App.tsx` | Modify | Add `<Route path="/preferences" element={<PreferencesRoute />} />` |
| `frontend/wailsjs/**` | Regenerate | `wails generate module` after PR1 — blocks PR2 |

## Interfaces / Contracts

```go
// internal/preferences/preferences.go
type Store interface {
    SeasonMode(ctx context.Context) (bool, error)
    SetSeasonMode(ctx context.Context, enabled bool) error
}
const seasonModeKey = "season_mode"
```

```sql
-- sqlite_bootstrap_preferences.go (CREATE TABLE IF NOT EXISTS, idempotent)
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
-- write: INSERT INTO app_settings(key,value) VALUES(?,?)
--        ON CONFLICT(key) DO UPDATE SET value = excluded.value
-- read : SELECT value ... WHERE key = ?  → sql.ErrNoRows ⇒ (false, nil)
```

Binding error-string convention (CODE-VERIFIED DRIFT): `app_download.go` setters return **`"ok"`**
on success (NOT `""` as the proposal stated). `SetSeasonMode` returns `"ok"` on success,
`"preferences store unavailable"` on nil store, or `err.Error()` on write failure. `GetSeasonMode`
returns `false` on nil store or read error — never panics.

Frontend store shape: `{ seasonMode: boolean; hasLoaded: boolean; errorMessage?: string;
refresh(source): Promise<void>; setSeasonMode(source, enabled): Promise<void> }`. No runtime event
subscription (load-once) — `resetPreferencesStore()` is the test-only seam. Load-on-mount lives in
`use-season-mode-panel.ts` (`useEffect`), NEVER in the dumb `.tsx`; `SeasonModePanel.tsx` invokes
its single colocated hook and renders (mirrors `SchedulePanel.tsx`).

## Testing Strategy (Strict TDD — RED first)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Go unit (adapter) | DDL round-trip; missing row ⇒ false; set→get true/false; upsert overwrites | Real temp `bridge.db` via `OpenBridgeDB(t.TempDir()+...)`; NEVER mutate `resources/*.dat` |
| Go unit (binding) | nil store ⇒ `false`/`"preferences store unavailable"`; wired store round-trips; `"ok"` on success | Fake `preferences.Store` injected on `App` |
| Frontend (store) | refresh sets seasonMode/hasLoaded; error path sets errorMessage; reset clears | vitest, fake source |
| Frontend (hook) | mount triggers refresh once; toggle persists then reflects | vitest + RTL renderHook |
| Frontend (helpers) | label/state mapping (Desactivado/Activado) | vitest |
| Frontend (panel) | renders toggle + helper text; reflects loading/error | RTL render |

## Migration / Rollout

No data migration. `CREATE TABLE IF NOT EXISTS` is additive and idempotent; existing DBs gain an
empty `app_settings`. Two PR slices: **PR1 Go** (DDL + context + bindings, TDD-first) → run
`wails generate module` → **PR2 Frontend** (source + store + panel + route + nav, TDD-first). Both
well under the 400-line review budget (~200–250 effective Go lines; comparable frontend).

## File-Size Budget Callouts

- `sqlite_bootstrap.go` (589 phys lines, already over hard-fail) — do NOT add DDL there; new file.
- New `sqlite_bootstrap_preferences.go`, `internal/preferences/*` — keep ≤400 effective; trivial.
- `preferences-source.ts` — leaner than `download-runtime-source.ts` (no event plumbing); safe.
- `AppLayout.tsx` (238 lines) — only a NAV_ITEMS entry + one small icon component; stays ≤400.
- Run `go run ./tools/checkgofilesize` before commit; `baseline.yaml` stays empty.

## Open Questions

None blocking. Both proposal open questions resolved above (text encoding; facade port).
