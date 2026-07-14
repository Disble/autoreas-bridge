# Tasks — sdd-48-reconcile-preserve-bridge-native-animes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-800 (4 files new + 5 modified + tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 -> PR4 (stacked, dependency order) |
| Delivery strategy | ask-on-risk (default, not specified by orchestrator) |
| Chain strategy | pending (needs user decision) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Ownership registry infra (Phase 1) | PR 1 | Standalone, testable in isolation; base = main |
| 2 | Reconcile exemption both call sites (Phase 2) + pipeline/watcher ownership wiring (part of Phase 5) | PR 2 | Depends on PR 1; base = PR 1 branch |
| 3 | CreateAnime registration (Phase 3) + WriteService ownership wiring (part of Phase 5) | PR 3 | Depends on PR 1; independent of PR 2 |
| 4 | One-time restore repair (Phase 4) + startup ordering (part of Phase 5) | PR 4 | Depends on PR 1-3 all merged (ordering + registry) |

## Phase 1: Infrastructure — ownership registry

- [x] 1.1 [TEST] `internal/sync/bridge_owned_store_test.go`: RegisterOwned round-trip + idempotency (ON CONFLICT DO NOTHING); ListOwnedIDs returns `map[string]struct{}`; table created via `initializeBridgeDB`
- [x] 1.2 `internal/sync/schema.go`: add `bridge_owned_animes` DDL descriptor to `schemaTables()`
- [x] 1.3 `internal/sync/bridge_owned_store.go` (new): `BridgeOwnedAnimeStore` implementing `RegisterOwned`/`ListOwnedIDs`
- [x] 1.4 `internal/anime`: add `BridgeNativeRegistry` port (`ListOwnedIDs`, `RegisterOwned`)

## Phase 2: Reconcile exemption — DiffSnapshots + call sites

- [x] 2.1 [TEST] `internal/anime/snapshot_test.go`: owned id survives absence; unowned id still soft-deletes; owned id with hash change still emits update; owned+already-soft-deleted baseline stays tombstone; nil `ownedIDs` reproduces prior behavior
- [x] 2.2 `internal/anime/snapshot.go`: add `ownedIDs map[string]struct{}` param to `DiffSnapshots`; owned retain branch beside existing soft-deleted branch
- [x] 2.3 [TEST] `internal/anime/snapshot_pull_pipeline_test.go`: ownership loaded and passed into diff; nil registry -> nil map -> unchanged behavior
- [x] 2.4 `internal/anime/snapshot_pull_pipeline.go:47`: config gains `ownership BridgeNativeRegistry`; load `ownedIDs` before `DiffSnapshots`
- [x] 2.5 [TEST] `internal/anime/watcher_test.go`: same ownership load+pass coverage at watcher call site
- [x] 2.6 `internal/anime/watcher.go:262`: `RuntimeWatcherConfig` gains `Ownership` field (nil-safe); load `ownedIDs` after `ListSnapshots`, pass into `DiffSnapshots`

## Phase 3: CreateAnime ownership registration

- [x] 3.1 [TEST] `internal/anime/service_test.go`: CreateAnime registers before write (ordering); registration error -> no write, no id returned; nil `Ownership` dep -> unchanged behavior
- [x] 3.2 `internal/anime/service.go`: `WriteServiceDeps` gains `Ownership BridgeNativeRegistry` (nil-safe); `CreateAnime` calls `RegisterOwned` before `applyWrite`, fail-closed on error

## Phase 4: One-time restore repair

- [x] 4.1 [TEST] `internal/anime/restore_bridge_native_test.go`: restore reactivates both known ids (Activo=true, FechaEliminacion cleared) AND registers ownership; idempotent second run is no-op; no-op for absent/already-active id; post-restore reconcile does not re-soft-delete
- [x] 4.2 `internal/anime/restore_bridge_native.go` (new): `restoreBridgeNativeAnimes` — `app_settings` flag `sdd48_bridge_native_restore_done` guard; for `P7y6ZIbvbYkefA7t` + `WEh5Vro3gKMGhY6i`: `ReplaceBaseline` reactivate + bump `modified_at`, then `RegisterOwned`; set flag true

## Phase 5: Composition root wiring

- [x] 5.1 `app_startup_runtime.go`: construct one `BridgeNativeRegistry` over `a.bridgeDB`; inject into `StartupCoordinatorConfig`, `LegacyPullServiceConfig`, `RuntimeWatcherConfig`, `WriteService.SetDeps`
- [x] 5.2 `app_startup_runtime.go`: run `restoreBridgeNativeAnimes` synchronously right after `bridge.db` bootstrap + registry construction, BEFORE `startAnimeRuntime` (ADR-48-5 ordering)

## Phase 6: Verification

- [x] 6.1 `go test ./...` — full suite green
- [x] 6.2 `gofmt -w .` — formatting
- [x] 6.3 `go vet ./...` — static checks
- [x] 6.4 `golangci-lint run` — lint gate
- [x] 6.5 `go run ./tools/checkgofilesize` — effective-line budget (<=500) on all touched/new files
