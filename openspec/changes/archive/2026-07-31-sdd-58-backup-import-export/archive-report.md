# Archive Report — SDD-58 Backup Export

## Executive Summary

SDD-58 backup export is complete and closed. Commit `33cb762` — "feat(backup): export bridge catalog and seasons as a portable bundle" — ships a production-ready export seam with three table groups (`anime_snapshots`, `seasons`, `season_animes`) in a single self-checksummed `.zip` manifest format. All gates pass. Verification performed by the orchestrating agent. Import is deferred to SDD-59 per the original proposal.

## What Shipped

**Scope**: EXPORT ONLY.

- **Core**: `internal/backup/` package with a zip container writer, manifest encoder/decoder, SHA-256 checksums (per-entry and bundle-wide), and an export driver that walks an ordered list of opaque export functions. Zero table knowledge. Stdlib-only (`archive/zip`, `encoding/json`, `crypto/sha256`, `io`, `context`, `time`, `fmt`, `errors`).
- **Export functions**: Three functions, each in the package owning its table group:
  - `internal/sync.ExportAnimeSnapshots(db *sql.DB)` — exports `anime_snapshots`
  - `internal/season.ExportSeasons(db *sql.DB)` — exports `seasons`
  - `internal/season.ExportSeasonAnimes(db *sql.DB)` — exports `season_animes`
- **Desktop binding**: `app_backup.go` (package `main`) — `ExportBackup()` method on the Wails `App`, native save dialog integration, composition-root wiring of the three export funcs, verify-after-read of the manifest.
- **Frontend**: `frontend/src/features/backup/` — dumb panel component, colocated hook with all Wails binding logic, helpers (`classifyExportOutcome`, `describeExportError`, `summarizeExportResult`), full test coverage (161 files / 1344 tests — all green).
- **Documentation**: ADR-009 (`docs/adr/009-backup-bundle-format-and-decentralized-ownership.md`) recording the bundle format, the function-as-port seam, the backward-compatibility policy, and the explicit non-change to `docs/openapi.yaml`. One entry in `docs/learning-log.md` (2026-07-31) recording the architectural trade-off: `RestorePointMaker` and the proposed stdlib-only linter rule were mutually justified and both cut because the `exportFn` seam already guarantees change locality by construction.

**Commit hash**: `33cb762`

**Files changed**: 38 files / 3753 insertions.

**Verification**: PASS — full gate run (go build, go test, go vet, gofmt, golangci-lint, checkgofilesize, checkarchitecture, frontend test 1344/1344, frontend validate, fallow audit zero-new, openapi.yaml unchanged). Eight mutation guards executed and reverted to green.

## Deferred Scope (SDD-59 Constraints)

The following policies constrain the bundle format. They were decided during SDD-58 review and must be carried forward to SDD-59 import, verbatim, in the archived spec's non-normative "Deferred to Import" section:

- **Full refresh (truncate-and-load)** — import is always replace-all/prune. Never a merge, never incremental.
- **Fail closed on a newer `formatVersion`** — zero writes if bundle format version exceeds the build's `SupportedFormatVersion`.
- **Tolerant reader by default, upcaster chain only for non-additive changes** — precedent: `internal/observability/requestcapture/reader.go:238` reads capture schema versions 1–5 with one tolerant reader; strategy of one reader per version is rejected (version readers not substitutable; costs N parsers kept alive forever).
- **Omission is not deletion** — a bundle is authoritative only for the table groups it **contains**; a table absent from the manifest is left completely untouched, never emptied.
- **`versionNotes map[int][]string`** — a seam recording what each format version added, written when `SupportedFormatVersion` is bumped, so an import preview can tell the user which fields will default. Documented in this spec; **not implemented by SDD-58.**

These constraints are embedded in `openspec/specs/backup-import-export/spec.md` (copied to main specs) and in the archived change folder.

## Repo Issues Surfaced (Not Fixed)

The following issues exist independent of this change and are recorded for future work:

1. **`tools/checksdd` rejects unchecked `- [ ]` in `tasks.md`** — a change cannot be committed slice-by-slice. SDD-58's six slices (58a–58c + docs) were designed as independently reviewable units but shipped as a single commit because all tasks must be checked before commit.

2. **Lefthook Go lint gate is `scripts/lint.ps1 -Profile all`, a superset of `golangci-lint run ./...`** — the script adds a custom `dlinter` (requireDoc) and `gocognit` that plain `golangci-lint run` misses. Running plain `golangci-lint run` reports "0 issues" while the actual gate fails.

3. **Committing with unstaged modifications in the tree destabilizes `frontend-test` inside the hook** — a clean tree passes; not a resource/timeout problem. Affects gate reliability.

4. **`HosterPriorityEditor.tsx` uses `react-aria-components`' `useDragAndDrop` (native HTML5 DnD), forbidden by AGENTS.md rule 11 for WebView2** — this is why hoster reorder is broken and why `download_hoster_priority` is out of scope.

5. **`AGENTS.md` references `docs/sdd-tree.md` and `docs/autoreas-bridge-design-doc.md`; neither exists** — ESLint rule references `docs/dlinter-vitest-mock-hygiene-proposal.md`; it does not exist either.

## Spec Archive Details

Merged delta spec from `openspec/changes/2026-07-31-sdd-58-backup-import-export/specs/backup-import-export/spec.md` into `openspec/specs/backup-import-export/spec.md` following the repo's existing archive convention (1-to-1 capability name folder structure in main specs).

The spec is wholly new (no ADDED/MODIFIED/REMOVED split) and contains:
- Seven requirement areas: bundle structure, manifest versioning, checksums, manifest ordering, export scope, streaming, and desktop-only surface.
- 20 scenario-based assertions (GIVEN/WHEN/THEN/MUST language).
- Non-normative "Deferred to Import" section documenting the five format-constraining decisions for SDD-59.

## Change Folder Archiving

Moved the entire change folder from `openspec/changes/2026-07-31-sdd-58-backup-import-export/` to `openspec/changes/archive/2026-07-31-sdd-58-backup-import-export/` preserving the original naming convention (date-prefix + SDD number + name).

Archived artifacts:
- `proposal.md` (133 lines, 8 closed decisions)
- `design.md` (355 lines, 8-point ADR outline, threat assessment, testing strategy with 9 mutation guards)
- `tasks.md` (362 lines, six implementation slices with strict TDD RED→GREEN→MUTATE→REFACTOR ordering, 12 mutation guards explicit by test name and exact deletion)
- `verify-report.md` (verified by orchestrator, 8 mutation guards executed, all green)
- `specs/backup-import-export/spec.md` (249 lines, new capability spec)
- `archive-report.md` (this file)

## Observation IDs for Traceability

All SDD-58 planning and execution artifacts were persisted to Engram memory during the SDD workflow. Key observation IDs:

- #7088: sdd/2026-07-31-sdd-58-backup-import-export/proposal
- #7090: sdd/2026-07-31-sdd-58-backup-import-export/spec
- #7095: sdd/2026-07-31-sdd-58-backup-import-export/design
- #7096: sdd/2026-07-31-sdd-58-backup-import-export/tasks
- #7109: sdd/2026-07-31-sdd-58-backup-import-export/apply-progress (implementation snapshot)

This archive report is also persisted to Engram as the terminal change summary.

## Status

COMPLETE. SDD-58 backup export is verified, committed, and archived. No open work. Next phase: SDD-59 import (deferred).
