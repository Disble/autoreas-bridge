# Exploration — 2026-06-29-sdd-31-season-mode (Modo Temporada / Season Mode)

> Engram: `sdd/2026-06-29-sdd-31-season-mode/explore` (id 4475)

## Feature
Global, persisted boolean "Modo temporada" originating from Legacy. Persists until the user
manually disables it. Read by animes, downloads, and future sections. Surfaced via a new
"Opciones / Preferencias" UI with a toggle panel. When enabled, "Ver animes" opens with the
Estrenos section expanded on the "Ver hoy" sub-category. Estrenos sub-categories: Sin ver / Visto / Ver hoy.

## Dark-Mode Mirror Hypothesis — REFUTED
Dark mode is **not implemented** in the bridge. No Go preferences/settings domain, no SQLite
settings table, no GetDarkMode/SetDarkMode binding, no frontend settings store, no `/preferences`
route. The only reference is a comment in `internal/download/jdownloader/launcher.go:13` describing
the **Legacy Electron** JSON settings file (`%APPDATA%/Autoreas/Settings`) which holds
`darkMode`, `is-season`, `downloader.dir`, `days`, etc. The bridge reads that file read-only and
only consumes `downloader.dir`; `is-season` and `darkMode` are ignored.

## Existing persistence patterns
- **Pattern A — Legacy Electron JSON Settings file** (foreign artifact, read-only from the bridge).
  Read in `internal/download/jdownloader/launcher.go` (`resolveExePathFromFile`,
  `autoreasSettingsPathFromEnv`). Fixture: `internal/download/jdownloader/launcher_test.go:76`.
- **Pattern B — SQLite singleton-row config tables in `bridge.db`** (canonical bridge pattern).
  `download_jd_config` (`id=1`), `download_schedule_config` (`id=1`) in
  `internal/sync/sqlite_bootstrap.go`. Domain types `download.JDConfig`, `download.ScheduleConfig`
  in `internal/download/store.go`. Adapter `internal/download/sqlite_store.go`. Bindings in
  `app_download.go`. Frontend infra `frontend/src/infrastructure/download-runtime-source.ts`,
  store `frontend/src/shared/store/download-runtime-store.ts`.

## "Ver animes" / Estrenos / Ver hoy — NOT IMPLEMENTED
`frontend/src/features/anime/ui/AnimePanel/` is a flat catalog list + `AnimeFilterBar`. No sidebar
grouping (no Día groups, no Estrenos section), no Sin ver/Visto/Ver hoy sub-categories, no
"open with section expanded on mount" logic. The `primeravez` field exists in the domain
(`internal/anime/domain/anime_raw.go` `LegacyAnimeRaw.Primeravez`) and in the mobile HTTP contract
(`MobileAnime.PrimeraVez`, `internal/anime/mobile.go`) but is NOT in the Wails `AnimeListItem` DTO
nor in `frontend/src/shared/contracts/anime.types.ts`. `dias []string` IS exposed.

## App / Wails binding pattern
`app.go` holds `App`. New bounded contexts inject a `newXStore func(db *sql.DB) X.Store` factory,
default-wired in `app_defaults.go` `ensureRuntimeDependencies()` (nil-guard), bindings in a
dedicated `app_*.go` file, store instantiated in `app.go startup()` after `a.bridgeDB` is ready.
All bindings degrade gracefully when the store is nil (safe defaults, never panic).

## Frontend infra/store/nav pattern
`infrastructure/download-runtime-source.ts`: imports `../../wailsjs/go/main/App`,
`waitForBindings(isReady)` polling helper, `create*Source()` singleton factory + const, exported
interface for test injection. `shared/store/download-runtime-store.ts`: zustand `create<State>()`,
`connect*Store()`/`reset*Store()` lifecycle, `useXStore` consumer hook. `App.tsx` React Router
under `<AppLayout/>`; `app/AppLayout.tsx` `NAV_ITEMS` drives sidebar + mobile tabs;
`app/routes/DownloadsRoute.tsx` is the reference multi-panel settings page.

## Recommended approach — A: bridge-owned key-value `app_settings` SQLite table
The bridge owns its state in SQLite; the Legacy JSON file is read-only/foreign. A key-value table
avoids per-column ALTER TABLE churn as new settings arrive. New `internal/preferences/` bounded
context + `app_preferences.go` bindings + `usePreferencesStore` + `/preferences` route + Options nav.

## Suggested slices
- PR1 (Go backend): `app_settings` DDL + `internal/preferences/` + `app_preferences.go`. TDD-first.
- PR2 (Frontend toggle UI): `preferences-source.ts` + `usePreferencesStore` + `SeasonModePanel` +
  `PreferencesRoute` + nav item. TDD-first.
- PR3 (Frontend AnimePanel Estrenos/Día sidebar + season-mode auto-expand): larger; depends on
  building the not-yet-existing sidebar. Candidate for a separate change (SDD-31b).

## Risks
- AnimePanel restructuring scope pushes `use-anime-panel.ts`/`AnimePanel.tsx` toward the 400-line warning.
- `primeravez` absent from `AnimeListItem` — additive Go contract change needed for Estrenos.
- `sqlite_bootstrap.go` line budget near warning; may need `sqlite_bootstrap_preferences.go`.
- Season-mode read timing on AnimeRoute mount must not cause layout shift / double render.
- New Wails bindings require `wails generate module` / `wails dev` to regenerate `wailsjs/`.
