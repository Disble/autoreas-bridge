# Tasks: SDD-49 Anime Repeat/Restore/Edit

## Review Workload Forecast

Estimated changed lines: 2,000-3,000
Delivery strategy: auto-chain

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Work Units

Chain: PR1 wire/mapper (base=tracker) -> PR2 write-bases -> PR3 gateway/OCC -> PR4 Create -> PR5 propagation -> PR6 UI -> PR7 enforcement; each child targets its predecessor.

Rollback: Legacy; SQLite; gateway; enrichment; adapters; UI/bindings; gate.

GREEN passes RED; REFACTOR reruns it.

## Unit 1: Lossless Legacy Boundary

- [x] 1.1 **RED:** add fixture/null/unknown round trips in `internal/anime/legacy/wire_test.go` and `internal/anime/legacy/mapper_test.go`; fail `go test ./internal/anime/... -run 'Legacy(Wire|Mapper)'`.
- [x] 1.2 **GREEN:** create `internal/anime/legacy/wire.go`, `internal/anime/legacy/mapper.go`; move `internal/anime/domain/anime_raw*.go` behavior and add canonical/Repeat/Restore changes to `internal/anime/domain/anime.go`.
- [x] 1.3 **REFACTOR:** route `internal/anime/parser.go` and `internal/anime/snapshot.go` through the mapper.

## Unit 2: Staged Write Bases

- [x] 2.1 **RED:** add migration/stage/finalize/query/recovery tests in `internal/sync/write_base_store_test.go` and `internal/sync/sqlite_bootstrap_migrations_test.go`; fail `go test ./internal/sync/... -run 'Write(Base|Operation)|Migration|Recover'`.
- [x] 2.2 **GREEN:** add `internal/anime/write_base_store.go`, `internal/sync/write_base_store.go`, and `anime_write_operations` DDL/indexes in `internal/sync/schema.go`.
- [x] 2.3 **REFACTOR:** cover desired/base/divergent recovery, abort, restart query, and no pruning.

## Unit 3: Gateway and OCC

- [x] 3.1 **RED:** add `internal/anime/legacy/gateway_test.go` and stale/base-less/no-op cases in `internal/anime/write_service_occ_test.go`; fail `go test ./internal/anime/... -run 'Gateway|OCC|Recovery'`.
- [x] 3.2 **GREEN:** create `internal/anime/legacy/gateway.go`; route `internal/anime/service.go`, `internal/anime/parser.go`, and `internal/anime/writer.go` through staged Get/List/Create/Update returning `AnimePatchResult`.
- [x] 3.3 **REFACTOR:** keep base-less last-write-wins, enforce explicit stale conflicts, and publish only committed writes.

## Unit 4: Canonical Create

- [x] 4.1 **RED:** test validation, nullable metadata, cover sentinel, ownership failure, and token in `internal/anime/write_service_create_test.go`, `internal/anime/service_test.go`, and `internal/anime/create_service_test.go`; fail `go test ./internal/anime/... -run 'CreateAnime|CreateService|Ownership'`.
- [x] 4.2 **GREEN:** add `internal/anime/create_service.go` with `MetadataProvider`; update `internal/anime/service.go`, `app.go`, and `app_season_availability.go` for enriched register-first Create.
- [x] 4.3 **REFACTOR:** keep metadata above the gateway; never map latest episode to `totalcap`.

## Unit 5: Outcome Propagation

- [x] 5.1 **RED:** update `internal/anime/chapter_service_test.go`, `app_activity_write_test.go`, `app_season_availability_test.go`, and API handler tests; fail `go test ./... -run 'PatchAnime|RepeatAnime|RestoreAnime|Season'`.
- [x] 5.2 **GREEN:** propagate outcomes/tokens through `internal/api/contracts/contracts.go`, `internal/anime/chapter_service.go`, `internal/api/handlers/common.go`, `internal/season/ports.go`, `internal/season/service.go`, `app_runtime.go`, `app_activity_write.go`, and season adapters.
- [x] 5.3 **REFACTOR:** keep mobile/HTTP projection stable, accept applied/no-op downstream, and record activity only for applied.

## Unit 6: UI, Catalog, Bindings

- [x] 6.1 **RED:** add action/conflict/refetch tests in `frontend/src/features/anime-detail/ui/AnimeDetail/__tests__/`; add all-records cases in `internal/anime/query_service_test.go` and `frontend/src/features/catalog/ui/CatalogPanel/__tests__/`; fail `go test ./internal/anime/... -run Catalog` and `bun --cwd=frontend run test -- AnimeDetail CatalogPanel`.
- [x] 6.2 **GREEN:** update AnimeDetail colocated files with HeroUI confirmations/base-aware actions and `frontend/src/infrastructure/bridge-runtime-source/*`; regenerate `frontend/wailsjs/go/main/App.{d.ts,js}` and `frontend/wailsjs/go/models.ts`.
- [x] 6.3 **REFACTOR:** keep TSX dumb, helpers documented, props readonly, and detail-only refetch on applied/no-op/conflict.

## Unit 7: Enforcement and Evidence

- [x] 7.1 **RED:** extend `tools/checkarchitecture/main_test.go` for Legacy DTO/file-I/O violations; fail `go test ./tools/checkarchitecture`.
- [x] 7.2 **GREEN:** update `tools/checkarchitecture/main.go`.
- [x] 7.3 **REFACTOR:** split touched Go files before 500 effective lines; run file-size and architecture gates.
- [x] 7.4 After each unit, check tasks and persist `sdd/2026-07-14-sdd-49-anime-repeat-restore-edit/apply-progress` with cycle commands/results, commit/PR, and rollback boundary.
- [x] 7.5 Verify: `go test ./...`; `go vet ./...`; `bun --cwd=frontend run validate`; `bun --cwd=frontend run test`; `go run ./tools/checkarchitecture`; `go run ./tools/checksdd`; `wails build`.
