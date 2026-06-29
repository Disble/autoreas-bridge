# Tasks — 2026-06-29-sdd-32-season-mode-download-selection

> Artifact store: hybrid · Strict TDD active · Branch: feat/sdd-31-season-mode (stacked)

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~70 Go (impl + tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

## Phase 1 — RED
- [x] 1.1 [RED] In `internal/download` add `service_season_mode_test.go` (mirror `service_run_status_test.go` fakes + `todayDiaName`): (a) season ON selects only the "Ver hoy" active anime, weekday anime excluded; (b) season ON + "Ver hoy" anime `activo==0` → excluded; (c) season OFF / nil seam → weekday selected, "Ver hoy" excluded; (d) season ON, no "Ver hoy" → terminal `no_animes_today`. Confirm tests fail for the right reason.

## Phase 2 — GREEN
- [x] 2.1 Add `SeasonMode func(ctx context.Context) bool` to `ServiceDeps` (with the design's doc comment).
- [x] 2.2 In `NewService`, default `SeasonMode` to `func(context.Context) bool { return false }` when nil.
- [x] 2.3 Add package const `seasonModeDiaName = "Ver hoy"`.
- [x] 2.4 In `listActiveAnimesToday`, compute `target` = today's weekday, override to `seasonModeDiaName` when `s.deps.SeasonMode(ctx)`; match `d.Dia == target`. Keep the `activo != 1` gate. All Phase 1 tests pass.

## Phase 3 — Wiring
- [x] 3.1 Locate the download `Service` construction (`ServiceDeps{...}` literal in app wiring — `app.go`/`app_download.go`) and set `SeasonMode` from `a.preferencesStore` (nil-safe + error-safe → false).

## Phase 4 — Verification
- [x] 4.1 `go test ./...` green, no regressions.
- [x] 4.2 `go vet ./...` + `golangci-lint run` clean.
- [x] 4.3 `go run ./tools/checkgofilesize` — no file over 500 effective lines (confirm `service.go` stays under 500).
