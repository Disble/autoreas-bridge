# Tasks: SDD-16 Mobile Sync Contract

## Phase 1: SDD Artifacts
- [x] 1.1 Create SDD-16 exploration, proposal, spec, design, tasks, and verify-report skeleton
- [x] 1.2 Record the bridge/mobile contract decision: PATCH remains the write path, reconcile returns bridge changes

## Phase 2: Strict TDD - mobile serializer and query surface
- [x] 2.1 Add RED tests for legacy snapshot -> mobile DTO normalization (`activo`, `primeravez`, `dias`, `generos`, `portada`, dates)
- [x] 2.2 Extend `LegacyAnimeRaw` with typed accessors required by the serializer
- [x] 2.3 Implement mobile DTO + serializer helpers
- [x] 2.4 Add query service methods for list/detail mobile snapshots
- [x] 2.5 Keep existing write-path behavior green

## Phase 3: Strict TDD - changelog persistence and incremental reads
- [x] 3.1 Add RED tests for upgraded `changelog` schema and query methods (`since`, `after id`, `last id`)
- [x] 3.2 Extend `events.AnimeChangedEvent` with change metadata
- [x] 3.3 Teach snapshot diff and update writer to publish create/update/delete metadata
- [x] 3.4 Upgrade `internal/sync` changelog schema/store/recorder to persist timestamp, change type, changed fields, snapshot JSON
- [x] 3.5 Add minimal conflicts store/schema and device list/revoke store methods

## Phase 4: Strict TDD - HTTP API
- [x] 4.1 Add RED router/handler tests for `GET /api/animes` and `GET /api/animes/:id`
- [x] 4.2 Add RED router/handler tests for `GET /api/animes/changes?since=` and upgraded `POST /api/sync/reconcile`
- [x] 4.3 Add RED router/handler tests for `GET /api/status`
- [x] 4.4 Add RED router/handler tests for `GET /api/devices` and `DELETE /api/devices/:id`
- [x] 4.5 Add RED router/handler tests for `GET /api/conflicts` and `POST /api/conflicts/:id/resolve`
- [x] 4.6 Implement handlers, contracts, and router wiring minimally until green

## Phase 5: Strict TDD - realtime contract
- [x] 5.1 Add RED tests for `anime_created` and `anime_deleted` message typing
- [x] 5.2 Update realtime message and hub mapping to emit the correct event type from change metadata

## Phase 6: Documentation and verification
- [x] 6.1 Update `docs/openapi.yaml` for all new REST endpoints and WS event notes
- [x] 6.2 Run `go test ./... -count=1`
- [x] 6.3 Run `go run ./tools/checkopenapi`
- [ ] 6.4 Write `verify-report.md` with requirement-by-requirement evidence
