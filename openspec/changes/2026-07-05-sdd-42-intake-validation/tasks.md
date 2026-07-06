# Tasks — sdd-42-intake-validation

## Work unit 1 — search + matcher (committed)
- [x] 1.1 jkanime `Searcher` + golden fixture (TDD)
- [x] 1.2 `internal/season/match` Normalize/Markers/Score/Resolve (TDD)

## Work unit 2 — use cases + bindings + UI
- [x] 2.1 `domain/season_anime.go` + enums
- [x] 2.2 `Repository` season_anime CRUD + store (candidates JSON) (TDD)
- [x] 2.3 `NameSearcher` port + jkanime adapter at composition root
- [x] 2.4 service ImportIntake / RunMatching / ResolveMatch / DiscardName (TDD)
- [x] 2.5 `app_season.go` bindings + nil-safe tests; regenerate Wails
- [x] 2.6 `season-source` + `season-store` intake methods (TDD)
- [x] 2.7 IntakePanel (helpers/hook/component) + wire into workspace tab (TDD)

## Gate
- [x] 3.1 Full lefthook gate green (frontend + Go + architecture + sdd + openapi)
