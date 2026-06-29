# Proposal — 2026-06-29-sdd-31-season-mode (Modo Temporada / Season Mode)

> Engram: `sdd/2026-06-29-sdd-31-season-mode/proposal`
> Exploration: `sdd/2026-06-29-sdd-31-season-mode/explore` (id 4475) · `openspec/changes/2026-06-29-sdd-31-season-mode/explore.md`

## Why

The Legacy Electron app carries a global "Modo temporada" (Season Mode) flag (`is-season` in
`%APPDATA%/Autoreas/Settings`) that signals to the whole app that a new anime season is running.
The bridge — the replacement for Legacy — has NO equivalent: there is no preferences/settings
domain, no settings table, no Options UI, and no way for any section to ask "are we in a season?".

Season Mode is a foundational cross-cutting flag that multiple sections (animes, downloads, future
sections) need to read. Shipping it now unblocks the user-facing Options surface and gives future
work (notably the AnimePanel Estrenos/"Ver hoy" sidebar) a stable, persisted contract to consume
with zero backend rework. We do it now because it is the prerequisite for that follow-up and because
the persistence + bindings + store + Options-route patterns are all already proven in the bridge
(download config), so the foundation is low-risk and self-contained.

Success looks like: a user opens a new "Opciones" section, flips a single "Activar temporada" toggle,
the value persists to `bridge.db`, survives a full app restart, and is readable by any section through
a clean store/binding contract — until the user manually turns it off.

## What Changes

1. **Backend persisted state** — a new bridge-owned key-value `app_settings` table in `bridge.db`
   and a new `internal/preferences/` bounded context (domain `Store` port + SQLite adapter), default-
   wired through the `app_defaults.go` factory pattern with graceful nil-store degradation.
2. **Wails bindings** — a new `app_preferences.go` exposing `GetSeasonMode() bool` and
   `SetSeasonMode(enabled bool) string`, mirroring the binding + error-string conventions of
   `app_download.go` (never panic, safe defaults, string error return).
3. **Frontend Options UI** — a new `/preferences` route + "Opciones" entry in `AppLayout` `NAV_ITEMS`,
   a `preferences-source.ts` infrastructure adapter, a `usePreferencesStore` zustand store, and a
   `SeasonModePanel` feature module (strict colocation, dumb `.tsx`) with the toggle
   (Desactivado/Activado) and helper text. The persisted value loads on mount and round-trips through
   the Go binding.
4. **Consumer-readable contract** — the season-mode flag is exposed through the store + binding so
   future consumers (anime/downloads, SDD-31b) read it without rework. No consumer BEHAVIOR is built
   here beyond what already exists.

## Impact

- New Go bounded context `internal/preferences/` (domain + SQLite adapter + tests).
- Additive DDL in `internal/sync/sqlite_bootstrap.go` (or a new `sqlite_bootstrap_preferences.go` if
  the line budget warns) — `CREATE TABLE IF NOT EXISTS app_settings (...)`, idempotent and safe.
- `app.go` gains a `preferencesStore preferences.Store` field; `app_defaults.go` gains the factory
  wiring; new `app_preferences.go` bindings file. Wails `wailsjs/` bindings must be regenerated.
- New frontend files: `infrastructure/preferences-source.ts`, `shared/store/preferences-store.ts`,
  `features/preferences/ui/SeasonModePanel/` (generated via `generate:feature`),
  `app/routes/PreferencesRoute.tsx`; edits to `app/AppLayout.tsx` (`NAV_ITEMS`) and `App.tsx` (route).
- No breaking changes. No existing consumer behavior changes. Additive only.

## Scope

### In scope
- Bridge-owned, persisted `seasonMode` boolean state in `bridge.db` via `app_settings` KV table.
- `internal/preferences/` bounded context: `Store` port, SQLite adapter, default factory, nil-guard.
- `GetSeasonMode` / `SetSeasonMode` Wails bindings in `app_preferences.go`.
- `/preferences` route + "Opciones" nav entry + `SeasonModePanel` toggle UI with helper text.
- `preferences-source.ts` infra adapter + `usePreferencesStore` store; load-on-mount round-trip.
- A clean, documented store/binding read contract for future consumers.
- Strict TDD for both stacks (Go `go test ./...`; frontend `bun --cwd=frontend run test` + `validate`).

### Out of scope (follow-up: **sdd-31b-anime-estrenos-sidebar**)
- The AnimePanel Estrenos/Día sidebar redesign (sidebar layout, Día groups).
- The Sin ver / Visto / Ver hoy sub-categories.
- Adding `primeravez` to the Wails `AnimeListItem` DTO and to the frontend `Anime` type.
- The actual "open Ver animes with Estrenos > Ver hoy expanded on mount" auto-expand behavior.
- Any downloads behavior driven by season mode (the `download.ServiceDeps` seam exists for later).

**Rationale for the split:** the auto-expand behavior depends on an Estrenos/"Ver hoy" sidebar that
does NOT exist yet in the bridge (current AnimePanel is a flat list). Building that sidebar is a
large, independent feature. SDD-31 ships the global state + Options UI + readable contract so the
follow-up consumes the flag with ZERO backend rework. This keeps SDD-31 self-contained and within
review budget.

## Approach

**Approach A — bridge-owned key-value `app_settings` SQLite table** (selected; alternatives B/C in
exploration rejected).

The bridge consistently owns its state in `bridge.db`; the Legacy JSON settings file is a foreign,
read-only artifact from which the bridge consumes only `downloader.dir`. Season mode, from the
bridge's perspective, is bridge-owned — Legacy is deprecated and being replaced. A key-value table
absorbs future settings (dark mode, dias config) as new ROWS rather than per-column `ALTER TABLE`
migrations (the churn that the singleton-row download tables already suffered with `enabled_weekdays`).

- **Domain/port** (`internal/preferences/preferences.go`): a `Store` interface with read/write of the
  season-mode flag (e.g. `SeasonMode(ctx) (bool, error)` / `SetSeasonMode(ctx, bool) error`), keyed
  internally by a stable `season_mode` key. Default (missing row) = `false`.
- **Adapter** (`internal/preferences/sqlite_store.go`): KV upsert/read against `app_settings`; boolean
  stored as text/int; transactional write. Tested first (`sqlite_store_test.go`) per strict TDD,
  preferably against a real temp `bridge.db` to validate DDL + round-trip.
- **Wiring**: `App.preferencesStore` field; `newPreferencesStore func(db *sql.DB) preferences.Store`
  factory default-wired in `app_defaults.go` `ensureRuntimeDependencies()`; instantiated in startup
  after `a.bridgeDB` is ready. All bindings degrade gracefully when the store is nil.
- **Bindings** (`app_preferences.go`): `GetSeasonMode()` returns `false` on nil store / error (never
  panics); `SetSeasonMode(enabled bool) string` returns "" on success or an error string, mirroring
  `app_download.go`.
- **Frontend**: `preferences-source.ts` wraps the regenerated `App` bindings with the
  `waitForBindings`/singleton-factory pattern from `download-runtime-source.ts`; `usePreferencesStore`
  is a load-once zustand store (no event subscription needed) with `connect`/`reset` lifecycle and a
  `useSeasonMode`-style selector. `SeasonModePanel` is dumb UI (HeroUI v3 + Tailwind, no Wails calls,
  no `useEffect`, no business logic); a colocated `use-*.ts` hook holds the load/toggle logic and the
  round-trip to the store/source. `PreferencesRoute` composes the panel (mirroring `DownloadsRoute`).

**Delivery (two PR slices, frontend depends on backend bindings):**
- **PR 1 (Go backend):** `app_settings` DDL + `internal/preferences/` + `app_preferences.go`, TDD-first.
- **PR 2 (Frontend toggle UI):** `preferences-source.ts` + `usePreferencesStore` + `SeasonModePanel`
  + `PreferencesRoute` + "Opciones" nav entry, TDD-first, after Wails bindings are regenerated.

Both slices are small and well within the 400-line warning budget; estimated ~200–250 effective Go
lines and a comparable frontend footprint across new files.

## Risks

- **`sqlite_bootstrap.go` line budget** — already near the 400-line warning. Adding DDL + an
  `ensureAppSettingsSchema()` introspection function may cross it; mitigation is to split into
  `sqlite_bootstrap_preferences.go`. Verify effective line count before committing.
- **Wails binding regeneration** — new bindings require `wails generate module` / `wails dev` to
  refresh `frontend/wailsjs/`; PR 2 is blocked until that is done. Treat regeneration as an explicit
  task, not an afterthought.
- **Load timing on mount** — `usePreferencesStore` must initiate its load without causing layout shift
  or a double fetch; the load belongs in the route/hook, not in the dumb panel.
- **Dual truth with Legacy** — if the user toggled `is-season` in the Legacy Electron app, the bridge
  value diverges. Accepted: Legacy is deprecated; the bridge is the authority for its own state.
- **Contract stability for SDD-31b** — the store/binding shape must be ergonomic for the follow-up so
  it consumes the flag with no backend rework; design the selector/contract with that consumer in mind.

## Open Questions

None blocking. Two design-phase notes (defer to `sdd-design`, do not block this proposal):
- Final `app_settings` value encoding for booleans (text "true"/"false" vs int 0/1) and the exact key
  constant name (`season_mode`).
- Whether the `Store` port should be season-mode-specific now or a generic KV `Get/Set(key)` from the
  start; leaning season-mode-specific facade over a generic KV adapter to keep the public contract tight.
