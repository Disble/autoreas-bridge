# Tasks — sdd-43-availability

## wu1 — CreateAnime
- [x] 1.1 domain.NewAnimeRaw (golden round-trip) + contracts.AnimeCreate
- [x] 1.2 WriteService.CreateAnime + SetIDGen (TDD)

## wu2 — availability job
- [x] 2.1 move schedule package → internal/schedule
- [x] 2.2 AvailabilityProbe/AnimeGateway ports + RecheckAvailability (TDD)
- [x] 2.3 probe + gateway + schedule config-store adapters (TDD)
- [x] 2.4 second scheduler instance + RunFunc (guard, notify, download chain)
- [x] 2.5 RecheckSeasonAvailability binding; Wails regenerated

## wu3 — Daily Board + section move
- [x] 3.1 ChapterService.SetAnimeDays + binding (TDD)
- [x] 3.2 season-source/store setAnimeDays + recheckAvailability
- [x] 3.3 DailyBoard (helpers/hook/component) + enable daily tab (TDD)

## Gate
- [x] 4.1 Full lefthook gate green (each commit)
