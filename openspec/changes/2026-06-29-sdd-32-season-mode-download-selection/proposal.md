# Proposal — 2026-06-29-sdd-32-season-mode-download-selection

## Why
SDD-31 shipped the global, persisted "Modo temporada" (season mode) boolean + Options toggle, but
nothing consumes it yet. The first (and currently only) real consumer is the **Downloads** section.

A user-confirmed legacy-data fact drives this change: in `animes.dat` the `dias` array does NOT only
hold weekday names — it also holds the Estrenos category labels **"Sin ver" / "Visto" / "Ver hoy"**
as `dia` values. Each anime is EITHER weekday-scheduled OR an Estrenos anime (verified: 0 animes mix
both). Counts in the real fixture: Visto 194, Ver hoy 35, Sin ver 5, plus the 7 weekdays.

During a new season the user wants the download run to target the curated **"Ver hoy"** set instead
of the regular weekday schedule.

## What changes
`internal/download` selection (`listActiveAnimesToday`) gains season awareness:

| Season mode | Animes selected for a download run |
|-------------|-----------------------------------|
| OFF (default) | `activo==1` AND `dias` contains **today's Spanish weekday** (unchanged) |
| ON | `activo==1` AND `dias` contains the literal **"Ver hoy"** |

Everything else is identical: the `activo==1` gate stays, the per-anime gates (tipo movie/OVA skip,
`pagina`/`carpeta` required, `needsDownload` highest-online-vs-disk comparison) are untouched, and the
`no_animes_today` terminal status still applies when the selected set is empty.

The `Service` learns the flag through a new injected seam `ServiceDeps.SeasonMode func(ctx) bool`
(defaults to `false` when unset — normal weekday selection). `app.go` wires it from the existing
`preferencesStore` (`GetSeasonMode`-style read). Downloads does NOT import the `preferences` package
(no context coupling).

## Impact
- `internal/download/service.go` — `ServiceDeps` gains `SeasonMode`; `NewService` defaults it;
  `listActiveAnimesToday` picks the target `dia` ("Ver hoy" vs today's weekday).
- A `seasonModeDiaName = "Ver hoy"` constant in the download package.
- App wiring (download Service construction) passes `SeasonMode` sourced from `preferencesStore`.
- Tests: season-on selects "Ver hoy" + ignores weekday rows; season-off unchanged; nil seam = off.

## Scope
- IN: the Downloads selection switch driven by the season flag.
- OUT: Dashboard "Syncing Now" needs no logic — it only displays the queue (`getSyncingAnimeItems`)
  and will reflect whatever Downloads enqueues. Any anime-management UI / Estrenos sidebar (does not
  exist in the bridge). No changes to the `dias` data model, the `activo` gate, or per-anime gates.

## Approach
Func-seam injection (mirrors every other `ServiceDeps` seam being an interface/func, nil-safe
default). Surgical change to the one selection function. Strict TDD with real fakes.

## Risks
- The "Ver hoy" string is a magic literal from legacy data; isolate it in one named constant.
- Must keep the `activo==1` gate (user confirmed historical `activo:false` is incidental, not a rule).
