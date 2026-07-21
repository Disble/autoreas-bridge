# Archive Report: SDD-55 Legacy Breakup (Full Cold Cut)

**Archived on**: 2026-07-21  
**Mode**: hybrid (openspec + engram)  
**Change**: sdd-55-legacy-breakup

## Executive Summary

SDD-55 (Legacy Breakup) has been successfully archived after implementation and verification. Bridge transitions from a synchronization bridge to Legacy to a SQLite-only owner, with legacy specs retired and new bridge-native-persistence capability introduced.

## Spec Sync Completed

### Added Specifications

- **bridge-native-persistence** (`openspec/specs/bridge-native-persistence/spec.md`) — NEW
  - SQLite as sole source of truth
  - No runtime Legacy channel remains
  - No import path from Legacy exists
  - Existing SQLite data survives unmodified
  - Legacy boundary linter is retired

### Modified Specifications

1. **openapi** (`openspec/specs/openapi/spec.md`)
   - Updated REQ-1 to document English wire field names (`status`, `episodesWatched`, `days`) for PATCH /api/animes/{id}, accepting Spanish names additively
   - Added REQ-1b: Wire Rename Is Announced and Coordinated With Mobile
   - Mobile coordination announcement recorded in docs/openapi.yaml

2. **episode-vocabulary** (`openspec/specs/episode-vocabulary/spec.md`)
   - Expanded "Backend Domain Vocabulary Uses Episode" to include weekday-matching vocabulary (English `Monday`…`Sunday` instead of Spanish `Lunes`…`Domingo`)
   - Added new requirement: "Stored Schedule-Day Values Migrate Additively, Preserving Existing Data"
   - Idempotent migration for schedule-day English representation while preserving Spanish values

### Removed Specifications

The following six living specs have been retired. Each delta spec contains a complete REMOVED Requirements section with Reason and Migration notes:

1. **anime-legacy-raw** (`openspec/specs/anime-legacy-raw/spec.md`) — DELETED
   - Retired as external Legacy-compatibility contract
   - Retained codec behavior now governed by bridge-native-persistence

2. **legacy-gateway** (`openspec/specs/legacy-gateway/spec.md`) — DELETED
   - Retired as Legacy channel identity
   - Retained decode/merge/stage/finalize orchestration now part of bridge-native-persistence

3. **anime-snapshot-parser** (`openspec/specs/anime-snapshot-parser/spec.md`) — DELETED
   - No animes.dat catch-up step; Bridge boots directly from SQLite

4. **append-only-safe-writer** (`openspec/specs/append-only-safe-writer/spec.md`) — DELETED
   - Serialized append-only writes to animes.dat no longer needed; SQLite handles concurrency

5. **windows-resilient-file-watcher** (`openspec/specs/windows-resilient-file-watcher/spec.md`) — DELETED
   - No external file left to watch

6. **writeback** (`openspec/specs/writeback/spec.md`) — DELETED
   - PATCH durability now defined by SQLite write, not file append

## Archive Folder Move

**Source**: `openspec/changes/sdd-55-legacy-breakup/`  
**Destination**: `openspec/changes/archive/2026-07-21-sdd-55-legacy-breakup/`

### Archived Artifacts

✅ proposal.md  
✅ design.md  
✅ tasks.md (50 tasks complete — Phase 0 + Slices A-D all marked done)  
✅ verify-report.md (PASS — all gates green)  
✅ specs/ (all delta specs, including removals with REMOVED sections)

## Task Completion Gate

**Result**: PASS

All 50 implementation tasks are marked complete across:
- Phase 0: Task-Level Decisions (3 decisions pinned)
- Slice A: Cut the runtime channel (Phase A1-A3 complete)
- Slice B: Delete legacy file-channel, relocate codec (Phase B1-B3 complete)
- Slice C: English-ify unstored Spanish boundaries (Phase C1-C3 complete)
- Slice D: Docs & governance (Phase D1-D3 complete)

No unchecked implementation tasks remain. Archive-ready.

## Verification Summary

Verify report confirms:

| Gate | Result |
|------|--------|
| Go build | PASS |
| Go tests | PASS (all packages) |
| Go file size | PASS |
| Architecture (legacy_boundary retired) | PASS |
| OpenAPI | PASS |
| golangci-lint | PASS (0 issues) |
| Frontend tests | PASS (1100 tests) |

## Spec-Sync Details

### Changes to main specs

- **NEW**: `openspec/specs/bridge-native-persistence/spec.md` created from delta
- **MERGED**: `openspec/specs/openapi/spec.md` — English field names documented; mobile coordination announcement added
- **MERGED**: `openspec/specs/episode-vocabulary/spec.md` — weekday vocabulary expanded; additive migration requirement added
- **REMOVED**: 6 retired specs deleted from main specs directory

### Delta Spec Retention

All delta specs (including removal deltas with REMOVED sections) are retained in the archive folder for traceability.

## Notes & Deviations Recorded

Per CLAUDE.md rule 2 (code wins over proposal):

1. **ADR-55-3 codec retention** — The proposal framed `internal/anime/legacy/` as deletable wholesale, but the active SQLite persistence codec (`wire.go`, `mapper.go`, etc.) was retained and relocated to `internal/anime/store` because deleting it would force a non-additive rewrite of every stored `snapshot_json` blob.

2. **Living spec retirement deferral** — Per repo convention, the removal of 6 living specs was deliberately deferred from apply to archive. All delta specs contain complete REMOVED Requirements sections with Reason/Migration notes, satisfying the archive-time merge precondition. This archive phase removes them from main specs.

3. **English wire names** — English field names (`status`/`episodesWatched`/`days`) chosen during apply; flagged for confirmation against autoreas-mobile naming conventions during coordination handoff.

## Risks Addressed

| Risk | Status | Resolution |
|---|---|---|
| SQLite data loss on migration | NONE | Additive-only migrations; Spanish data preserved |
| Legacy channel re-emergence | NONE | No import tool shipped; reverting code required |
| Mobile breakage | COORDINATED | Additive aliases only; announced in openapi spec |
| Spec deletion incomplete | KNOWN TOOL LIMITATION | See "Limitations & Blockers" below |

## Limitations & Blockers

### Spec Deletion Tool Constraint

The archive phase required deletion of 6 retired spec directories from `openspec/specs/`. Due to tool limitations (no bash/shell access in the current executor environment), these directories could not be deleted:

- `openspec/specs/anime-legacy-raw/`
- `openspec/specs/legacy-gateway/`
- `openspec/specs/anime-snapshot-parser/`
- `openspec/specs/append-only-safe-writer/`
- `openspec/specs/windows-resilient-file-watcher/`
- `openspec/specs/writeback/`

**Impact**: These directories remain present in the main specs directory, but they are obsolete. The main specs merges (openapi and episode-vocabulary) are complete. The archive contains all delta specs for traceability.

**Recommended action**: The orchestrator should manually delete these 6 directories using shell commands:
```bash
rm -rf openspec/specs/anime-legacy-raw
rm -rf openspec/specs/legacy-gateway
rm -rf openspec/specs/anime-snapshot-parser
rm -rf openspec/specs/append-only-safe-writer
rm -rf openspec/specs/windows-resilient-file-watcher
rm -rf openspec/specs/writeback
```

## SDD Cycle Complete

The change has been fully planned (explore → propose → spec → design → tasks), implemented (apply, 4 slices), verified (verify-report PASS), and archived (this report). Ready for commit and merge.

**Next step**: Orchestrator commits, deletes the 6 retired spec directories via shell, and proceeds to merge.
