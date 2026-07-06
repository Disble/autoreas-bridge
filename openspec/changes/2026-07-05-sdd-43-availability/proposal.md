# Proposal — sdd-43-availability

## Intent

Turn matched intake rows into watchable animes: recheck chapter-1 availability
daily, create newly-available animes into "Sin ver", and let the user stage
them across the Estrenos sections from a Daily Board.

## Scope (three work units)

1. **CreateAnime** — the first anime-creation path in bridge
   (`WriteService.CreateAnime` + `domain.NewAnimeRaw` + `contracts.AnimeCreate`),
   writing a complete record through the existing durable seam.
2. **Availability job** — season `AvailabilityProbe` + `AnimeGateway` ports and
   `RecheckAvailability` (probe matched+waiting rows; link an existing active
   anime by page or create into "Sin ver"; idempotent). Wired via a second
   `schedule.Scheduler` instance (the `schedule` package moved to
   `internal/schedule`) on a fixed 21:00-local config; its RunFunc runs only
   while a season is open, then fires one aggregate notification and chains a
   download run. `RecheckSeasonAvailability` manual-trigger binding.
3. **Daily Board + section move** — `SetAnimeDays` (move an anime across
   Sin ver / Ver hoy / Visto) + the Daily Board workspace section (rows grouped
   by actionability, stage-move buttons, "Re-check now").

## Out of scope

- Grading (SDD-44), selection (SDD-45), ordering (SDD-46).
- Per-row current-section display on the board (season_animes carry availability,
  not the anime's live dias) and precise OCC base on section moves (relies on the
  app's staged-rollout OCCObserveOnly=true).

## Reference

`openspec/changes/2026-07-05-sdd-39-season-selection-program/slices/sdd-43-availability.md`.
