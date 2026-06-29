# Design — 2026-06-29-sdd-32-season-mode-download-selection

## Context (runtime truth)
- Selection lives in `internal/download/service.go` `listActiveAnimesToday` (≈L257). Current rule:
  `today := config.SpanishWeekdayName(s.deps.Clock())`; keep an anime when `anime.Activo == 1` AND
  some `d.Dia == today`.
- `ServiceDeps` (≈L55) is an all-seams struct (every dep is an interface or func); `NewService`
  (≈L97) fills nil-able defaults (Clock, NewRunID, PollSleep).
- SDD-31 provides persisted season state: `preferences.Store.SeasonMode(ctx)` and the Wails binding
  `(*App).GetSeasonMode()`; `a.preferencesStore` is wired in `app.go startup()`.

## Decision 1 — inject the flag as a func seam (not the preferences.Store)
Add to `ServiceDeps`:
```go
// SeasonMode reports whether "modo temporada" is enabled. When nil (or in tests that don't set it)
// it defaults to always-false, i.e. normal weekday selection. Injected as a func — like every other
// ServiceDeps seam — so download never imports the preferences context (no cross-context coupling).
SeasonMode func(ctx context.Context) bool
```
`NewService` defaults it: `if deps.SeasonMode == nil { deps.SeasonMode = func(context.Context) bool { return false } }`.

Rationale: keeps download's dependency surface as interfaces/funcs (ADR consistency, unit-testable),
and preserves the rule that download has no compile dependency on other bounded contexts.

## Decision 2 — single named constant for the legacy literal
`const seasonModeDiaName = "Ver hoy"` in the download package (package-private). The "Ver hoy" string
is legacy `animes.dat` data; isolate it so it is never duplicated.

## Decision 3 — switch only the target `dia`, nothing else
```go
target := config.SpanishWeekdayName(s.deps.Clock())
if s.deps.SeasonMode(ctx) {
    target = seasonModeDiaName
}
...
for _, d := range anime.Dias {
    if d.Dia == target { active = append(active, anime); break }
}
```
The `anime.Activo != 1` gate, the empty-set → `no_animes_today` terminal status, and all per-anime
gates downstream are unchanged.

## Decision 4 — app wiring
At the download `Service` construction site (the `ServiceDeps{...}` literal in app wiring — apply must
locate it; likely `app.go` or `app_download.go`), set:
```go
SeasonMode: func(ctx context.Context) bool {
    if a.preferencesStore == nil { return false }
    enabled, err := a.preferencesStore.SeasonMode(ctx)
    if err != nil { return false }
    return enabled
},
```
Nil-safe and error-safe → defaults to normal weekday selection, never panics.

## Test strategy (Strict TDD, real fakes)
RED first in `internal/download` (mirror existing `service_run_status_test.go` style; uses a fake
AnimeQueryService and `todayDiaName(now)` helper):
1. Season ON → run selects only animes whose `dias` contains "Ver hoy"; an `activo==1` weekday-only
   anime is NOT selected; the "Ver hoy" anime IS.
2. Season ON but the "Ver hoy" anime has `activo==0` → NOT selected (activo gate still applies).
3. Season OFF (and nil seam) → behavior unchanged: weekday match selected, "Ver hoy" anime ignored.
4. Season ON with no "Ver hoy" animes → terminal `no_animes_today`.

Then GREEN: add the seam + constant + target switch + wiring. Run `go test ./...`, `go vet ./...`,
`golangci-lint run`, `go run ./tools/checkgofilesize`.

## File-size budget
`service.go` is at ~452 effective lines (warn zone, under 500 hard-fail). This change adds ~6 lines;
confirm it does not cross 500. If it would, extract the selection helper — but +6 lines will not.
