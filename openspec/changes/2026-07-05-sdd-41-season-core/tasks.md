# Tasks — sdd-41-season-core

## 1. Domain (TDD)
- [x] 1.1 `Decision` golden Excel-parity suite → `domain/decision.go`
- [x] 1.2 `Season` lifecycle + parameter guards → `domain/season.go`

## 2. Persistence (TDD)
- [x] 2.1 `schema.go` seasons + season_animes (+ single-open index)
- [x] 2.2 store round-trip tests → `sqlite_store.go` + `ports.go`
- [x] 2.3 register in `initializeBridgeDB`

## 3. Service (TDD)
- [x] 3.1 service unit tests → `service.go` (create/active/params/close)

## 4. Bindings + realtime (TDD)
- [x] 4.1 `season_changed` message + `BroadcastSeasonChanged` (hub + stub)
- [x] 4.2 `app.go`/`app_defaults.go` wiring; `app_season.go` nil-safe bindings
- [x] 4.3 nil-safe binding tests + broadcast assertion
- [x] 4.4 regenerate Wails bindings (`wails generate module`)

## 5. Frontend (TDD)
- [x] 5.1 `season-source.ts`
- [x] 5.2 `season-store.ts` + store tests
- [x] 5.3 SeasonWorkspace helpers/hook/component + tests
- [x] 5.4 `/season` route + nav entry (App.test nav count updated)

## 6. Gate
- [x] 6.1 Full lefthook gate green (frontend + Go + architecture + sdd + openapi)
