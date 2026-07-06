# Design — sdd-43-availability

## CreateAnime (wu1)

`domain.NewAnimeRaw(NewAnimeSpec)` builds a complete record via the exact Legacy
JSON shapes (activo/primeravez booleans, dates `{"$$date":ms}`, dias entry) and
parses it back → byte-stable through MarshalJSON. `WriteService.CreateAnime`
marshals it and calls `applyWrite` (writer queue → animes.dat → confirmed
snapshot → anime.changed → changelog + realtime), same seam as every write. Id
via a `SetIDGen` seam defaulting to a 16-char NeDB-style id.

## Availability job (wu2)

- `schedule` package moved `internal/download/schedule → internal/schedule` (git
  mv + import update); the generic scheduler is now composed by two features.
- Season ports `AvailabilityProbe` / `AnimeGateway` (+ `AnimeCreateInput`);
  `Service.RecheckAvailability` returns `RecheckResult{Created, Checked}`. Wired
  via `SetAvailabilityDeps`.
- Composition root (`app_season_availability.go`): `seasonAvailabilityProbe`
  over the jkanime registry (`LatestEpisode >= 1`; unresolvable → not-available,
  not an error); `seasonAnimeGateway` over `WriteService.CreateAnime` +
  snapshot-store scan for `FindActiveByPagina`/`nextOrden` (the query
  read-models hide the raw pagina); `seasonScheduleStore` fixed at 21:00 local.
  `startSeasonAvailability` starts a second `schedule.NewScheduler`; its RunFunc
  guards on an open season (season mode is derived), then notifies + chains a
  download `TriggerNow` (tolerating `ErrRunInProgress`).

## Daily Board + section move (wu3)

- `ChapterService.SetAnimeDays` (+ `SetAnimeDaysCommand`) patches
  `AnimePatch{Dias}` (PreserveLastWatched); `SetAnimeDays` binding.
- `season-source`/`season-store` gain `setAnimeDays` (base 0 under the app's
  OCCObserveOnly) and `recheckAvailability`. Daily Board workspace section
  (`groupDailyBoard`: created / waiting / other) with stage-move buttons and a
  "Re-check now" button; wired as the now-enabled `daily` workspace tab.

## TDD

Domain golden (NewAnimeRaw), CreateAnime writer payload, RecheckAvailability
(create/link/wait, idempotent), adapters (probe mapping, FindActiveByPagina,
nextOrden, fixed config), SetAnimeDays writer payload, DailyBoard helpers/hook/
component. Wails bindings regenerated.
