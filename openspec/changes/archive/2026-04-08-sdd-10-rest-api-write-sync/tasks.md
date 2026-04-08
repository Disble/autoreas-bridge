# Tasks: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

## Phase 1: Infrastructure & Types

- [x] 1.1 Update `internal/api/server.go` to define `AnimePatch`, `EffectiveAnime`, `AnimeQueryService`, `AnimeWriteService`, and `SyncTriggerService`; extend `api.Config` with those dependencies.
- [x] 1.2 Extend `internal/sync/anime_snapshot_store.go` with single-anime snapshot lookup returning raw snapshot JSON by `anime_id`.
- [x] 1.3 Create `internal/anime/service.go` and `internal/sync/service.go` skeletons for concrete query/write/reconcile services with constructor seams.
- [x] 1.4 Add stub services and shared test helpers in `internal/api/router_test.go`, `internal/anime/service_test.go`, and `internal/sync/service_test.go` before production code.

## Phase 2: RED — Failing Tests

- [x] 2.1 Extend `internal/api/router_test.go` with PATCH auth/method guards: 401 missing bearer, `POST /api/animes` 405, and `DELETE /api/animes/:id` 405 before auth.
- [x] 2.2 Add PATCH validation tests in `internal/api/router_test.go` for invalid `estado`, negative `nrocapvisto`, malformed JSON, and 404 zombie/not-found mapping.
- [x] 2.3 Add PATCH success tests in `internal/api/router_test.go` for 200 valid payload, inactive anime still patchable, and client timestamp silently discarded.
- [x] 2.4 Add PATCH cross-field test in `internal/api/router_test.go` asserting `nrocapvisto >= totalcap > 0` reaches the write service with forced `estado=1`.
- [x] 2.5 Add `POST /api/sync/reconcile` tests in `internal/api/router_test.go` for 401 missing bearer and 202 accepted.
- [x] 2.6 Create `internal/anime/service_test.go` with real SQLite in `t.TempDir()` proving full snapshot merge/publish and fractional `nrocapvisto` retention.
- [x] 2.7 Add service tests in `internal/anime/service_test.go` for cross-field force-finalizado and query semantics: zombie returns error, `activo=false` returns `EffectiveAnime`.
- [x] 2.8 Create `internal/sync/service_test.go` proving `SyncTriggerService` publishes `events.SyncRequestedEvent` on the in-memory bus.
- [x] 2.9 Extend `internal/anime/domain/anime_raw_test.go` with failing helper tests for typed `estado`, `totalcap`, `dias`, and server timestamp mutation.

## Phase 3: GREEN — Minimum Implementation

- [x] 3.1 Create `internal/api/handlers/anime_handler.go` to decode strict PATCH JSON, validate payload, discard transport timestamps, and map domain errors to 400/404/200.
- [x] 3.2 Create `internal/api/handlers/sync_handler.go` to authenticate, trigger reconcile, and return 202 Accepted.
- [x] 3.3 Implement `internal/anime/service.go` query/write services: load `anime_snapshots`, merge `domain.LegacyAnimeRaw`, force `estado=1`, stamp server time, and publish full `events.AnimeUpdateRequestedEvent`.
- [x] 3.4 Implement `internal/sync/service.go` reconcile trigger service publishing `events.SyncRequestedEvent`.
- [x] 3.5 Modify `internal/api/router.go` and `app.go` to wire the new handlers/services through `api.Config`.

## Phase 4: REFACTOR

- [x] 4.1 Refactor `internal/anime/domain/anime_raw.go` to expose typed helpers/setters for `estado`, `totalcap`, `dias`, and canonical timestamp updates.
- [x] 4.2 Extract shared PATCH/service helpers in `internal/anime/service.go` or `internal/api/handlers/anime_handler.go` to remove duplication while keeping tests green.
