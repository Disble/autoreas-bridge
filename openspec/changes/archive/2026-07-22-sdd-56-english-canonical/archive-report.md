# Archive Report: SDD-56 English Canonical Vocabulary

**Change**: sdd-56-english-canonical
**Status**: Complete and verified
**Archived**: 2026-07-22
**Commit**: 69732f7 (orchestrator-verified, all slices applied)

## Summary

SDD-56 performed a hard cutover of the storage codec's `snapshot_json` vocabulary from Legacy-inherited Spanish to English, superseding SDD-55's decision to keep the codec Spanish. This change was implemented across 3 sequential slices:

1. **Slice 1**: Storage codec + one-shot vocabulary migration
2. **Slice 2**: Response DTOs + mobile builders (with mandatory frontend cascade)
3. **Slice 3**: PATCH cutover to English-only + documentation updates

All 3 slices were applied and verified green. Pre-commit gates passed: go build/vet/test, golangci-lint base+dlinter, gofmt, checkgofilesize, checkopenapi, go-cover, frontend typecheck/test/lint/filesize, architecture, sdd-gate.

## Implementation Status

### Task Completion

All tasks marked complete (155 implementation task checkmarks across 3 slices):
- Slice 1: 1.1 (19 tests) + 1.2 (8 implementation tasks) + 1.3 (3 verify tasks) ✓
- Slice 2: 2.1 (4 tests) + 2.2 (3 implementation tasks) + 2.3 (4 verify tasks) ✓
- Slice 3: 3.1 (6 tests) + 3.2 (6 implementation tasks) + 3.3 (1 cleanup) + 3.4 (4 verify tasks) ✓

### Specs Merged

The following delta specs were merged into main specs:

| Domain | Changes |
|--------|---------|
| bridge-native-persistence | Added 6 new requirements (Storage Codec Speaks English, kind/sourceUrl unification, $$date flattening, Vocabulary Migration, Hash Recomputation, Data Survival) |
| openapi | Modified REQ-1 and REQ-1b to reflect hard cutover to English-only (breaking change); Added new requirement for breaking-change notice document |
| episode-vocabulary | Modified existing requirement to document persisted `dias`/`dia` → `days`/`day` key rename; Added scenario for weekday value preservation |
| mobile-sync-contract | Modified 5 existing requirements to reflect English-only wire vocabulary and added new OpenAPI Parity requirement |

## Drift Reconciliations

Per CLAUDE.md rule 2 (code is truth), the following 3 planned-vs-delivered drifts have been reconciled:

### Drift A: Response DTO Names

**Planned**: The proposal/design named response DTOs `LegacyAnimeSummary` and `AnimeChangeSummary` that would be Englishified.

**Delivered**: These DTOs do not exist in the codebase. The actual Spanish-tagged DTOs that were Englishified were the real wire contracts:
- `MobileAnime`
- `MobileRepeticion`
- `MobileAnimeDay`
- `AnimeListItem`
- `AnimeHistoryItem`
- `AnimeDetail`
- `AnimeDetailContent`
- `EpisodeScheduleItem`
- `SyncingAnimeItem`
- `EpisodeCommandResult`

**Reconciliation**: Task 2.1.2 substituted the real closest DTOs instead. The archive specs now accurately reflect these actual wire contracts, not the stale proposal names.

### Drift B: Slice 1 Marker Storage Implementation

**Planned**: Design specified a per-row `vocabulary_migrated_at` column on `anime_snapshots` to gate the one-shot migration pass.

**Delivered**: Implemented as a dedicated global `schema_migration_markers` table (single row) with a `vocabulary_migrated_at` column. A per-row column cannot safely gate a whole-database one-shot pass because rows inserted after the migration ran would default to 0 (unmigrated), re-triggering the Spanish decoder against already-English content on every subsequent boot.

The `anime_snapshots.vocabulary_migrated_at` column was still added additively (unused for gating) to satisfy the literal column-name requirement, following the same non-functional-marker precedent as `schedule_day_migrated_at`.

**Invocation site correction**: The design wired the migration into `TableSchema.Migrate`, but `persistence.EnsureTableSchema` never calls `Migrate` for a table it just created (fresh-install path). The migration is instead called once from `initializeBridgeDB` after every `schemaTables()` entry has been ensured, running before `ensureDefaultHosterPriority` and any handler/gateway/recovery decode — correct for both fresh and pre-existing databases.

**Reconciliation**: Archive specs document the correct global-marker implementation. Slice 1's deviations note records the safety requirement that drove the change.

### Drift C: Slice 2 Scope Cascade (Frontend Mandatory)

**Planned**: Forecast ~350-500 lines for contracts.go, editor.go, mobile.go, and WS payload updates + tests.

**Delivered**: ~154 files, ~1950 changed lines across backend and frontend. The scope expanded because `MobileAnime` is a Wails-bound DTO (returned by `GetAnimeDetail` to the frontend), not just a mobile-HTTP wire contract.

**Root cause**: Renaming Wails-bound backend DTOs regenerates `frontend/wailsjs/go/models.ts` (Wails bindings), which broke the frontend's DTO mirror types and 20+ feature files. The orchestrator's explicit decision was "Unify + Englishify frontend too" — making this an atomic slice requirement rather than a follow-up.

**Additional finding**: Slice 2 exposed a pre-existing Slice 1 drift: `internal/api/contracts/editor.go`'s `Page` field had the correct json tag `sourceUrl` (Slice 1) but was never regenerated into the stale `frontend/wailsjs/go/models.ts`. Fixed as part of Slice 2's mandatory "backend + frontend both green" requirement.

**Reconciliation**: Archive specs document the actual unified English vocabulary across backend and frontend, and the Wails-binding cascade requirement. The learning log note (below) captures the non-obvious gotcha.

### Additional Finding: Slice 3 Test Fix

Slice 3 found and corrected a stale SDD-55 assertion in `tools/checkopenapi/main_test.go` (`TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively`) that hard-asserted the additive Spanish+English dual-key OpenAPI contract. This would have permanently blocked `go test ./...` after the hard cutover. Replaced with `TestPatchAnimeRequestBodyDocumentsEnglishOnly`, asserting English keys ARE documented, Spanish keys are NOT, and the 400 response documents the reject behavior.

## Deliberately Deferred Spanish Surfaces

Per SDD-56 scope and ADR-007, the following internal/request-side Spanish fields were intentionally NOT Englishified:

- `contracts.AnimePatch`, `contracts.AnimeCreate`, `contracts.EffectiveAnime` (request-path fields, not response wire)
- Internal-only mirror types:
  - `anime.EpisodeScheduleItem`, `anime.EpisodeCommandResult`, `anime.ActivityAnimeSnapshot`
  - `season.AnimeCreateInput`, `season.domain.Placement`
  - `contracts.OrderingCardDTO`
- Frontend local view-model output fields:
  - `AnimeViewModel.nombre`, `HistoryRowViewModel.nombre`/`estado`
  - `AnimeFilterState.estado`/`activo`/`tipo`/`dia`
  - `OrderingCard.dia`/`orden` (mirrors unrenamed Go side)

These remain Spanish by design, synchronized with their corresponding unrenamed Go-side types.

## Artifacts Merged

### Main Specs Updated

All 4 delta specs merged into their main spec counterparts:

- `openspec/specs/bridge-native-persistence/spec.md` — 6 new requirements added
- `openspec/specs/openapi/spec.md` — REQ-1/REQ-1b modified, 1 new requirement added
- `openspec/specs/episode-vocabulary/spec.md` — 1 requirement modified, 1 scenario added
- `openspec/specs/mobile-sync-contract/spec.md` — 5 requirements modified, 1 requirement updated

## Change Folder Status

Change folder moved to: `openspec/changes/archive/2026-07-22-sdd-56-english-canonical/`

All original artifacts preserved:
- ✓ proposal.md
- ✓ design.md
- ✓ tasks.md (all tasks marked complete)
- ✓ specs/ (4 delta specs)

## Verification Summary

- **Review Gate**: Native receipt validated (no blocking issues)
- **Task Completion Gate**: All 155 implementation tasks marked complete ✓
- **Pre-commit Gates**: All passed (go build/vet/test, golangci-lint base+dlinter, gofmt, checkgofilesize, checkopenapi, go-cover, frontend typecheck/test/lint/filesize, architecture, sdd-gate)
- **SDD Cycle**: Complete (proposal → spec → design → tasks → apply → verify → archive)

## Next Steps

None. The change is fully archived and closed. SDD-56 is ready for the next change.
