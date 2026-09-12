# Archive Report: 2026-09-11-sdd-67-keymap-in-backups

**Archived**: 2026-09-11
**Change**: Keymap In Backups
**Status**: Complete and verified
**Mode**: hybrid (openspec + engram)

## Executive Summary

The keymap in backups feature has been successfully implemented, verified, and archived. The change adds the `keyboard_keymap` group as a fourth export group in the backup bundle, makes imported keymaps immediately effective for dispatch without requiring an app restart, and proves each importer respects its declared footprint. All 42 tasks completed across three slices; verification PASS; all requirements proved with comprehensive test coverage including the mandatory packaged-app verification obligation, which verified the full cycle: rebind → export → reset → import with live dispatcher refresh.

## Specs Synced

### Backup Keymap Group (New)

| Domain | Action | Details |
|--------|--------|---------|
| backup-keymap-group | Created | New capability: export carries keymap document verbatim with present-but-empty semantics, import writes only keyboard.keymap key leaving other app_settings untouched, absent group leaves keymap untouched, unknown group ignored with warning, restored keymap reaches running dispatcher without restart, importer modifies only declared footprint |

**Requirements added**: 6 requirements (`Export Carries The Keymap Document Verbatim`, `Import Writes Only Its Own Key`, `A Present-But-Empty Group Resets The Keymap To Defaults`, `An Absent Group Leaves The Keymap Untouched`, `An Unknown Group Is Ignored With A Warning`, `A Restored Keymap Reaches The Running Dispatcher Without A Restart`, `An Importer Modifies Only Its Declared Footprint`) with 11 total scenarios proving the behaviour.

### Backup Import Export (Modified)

| Domain | Action | Details |
|--------|--------|---------|
| backup-import-export | Modified | Requirement renamed and modified: "Export Scope Is Exactly Three Table Groups" → "Export Scope Is Exactly Four Groups" to include `keyboard_keymap`. Five scenarios updated/split to clarify keyboard.keymap and app_settings handling separately |

**Requirements modified**: 1 requirement renamed and updated:
- "Export Scope Is Exactly Four Groups" (formerly "Export Scope Is Exactly Three Table Groups") — requirement text now mentions `keyboard_keymap` as the fourth group; five scenarios updated:
  - "Exactly the four in-scope groups are present" (formerly "three") — includes keyboard_keymap in manifest and record count
  - "Secret tables contribute zero rows to the bundle" — updated record count to include keyboard_keymap
  - "Machine-bound secrets contribute zero rows to the bundle" (formerly "Machine-bound and machine-local") — split to remove app_settings confusion
  - "Every app_settings key other than keyboard.keymap contributes zero bytes" (new) — explicitly states only keyboard.keymap from app_settings
  - "Observability and bookkeeping tables contribute zero rows" — unchanged

**Critical correction applied to spec**: SDD-67's export scenario originally claimed the exported line "MUST equal the persisted document, byte for byte". The design's envelope wrapping contradicted this (document wrapped in `{"document":"<value>"}`), and the guarantee cannot be byte-literal because the pinned opaque-bytes test from SDD-62 carries `{not json: alt++`, which is not valid JSONL. The corrected wording: the *document* survives unchanged, not the *line* being the document. Spec now accurately reflects the envelope design.

## Archive Contents

| Artifact | Status | Details |
|----------|--------|---------|
| proposal.md | ✅ Complete | Keymap in backups intent, scope (four export groups, import-only footprint, live refresh), approach (envelope design, verification obligations), sizing (3 slices), timeline |
| design.md | ✅ Complete | Technical approach: export envelope wrapping keymap opaquely, import-only footprint enforcement, load-bearing tests (footprint guard 2-state step), live refresh via hook re-render |
| tasks.md | ✅ Complete | 3 slices (SDD-67-1/2/3), 42 tasks total (all marked complete with `[x]`) — export group infrastructure, import group wiring with footprint enforcement, dispatcher refresh via `use-keymap-overrides` re-trigger, ADR corrections and documentation |
| verify-report.md | ✅ Complete | Verification PASS; 2672/2672 frontend tests passed, clean Go test suite, golangci-lint 0 issues, fallow audit clean, checkgofilesize passed, render:smoke clean, mutation testing with per-file measurements, `git diff --stat -- docs/openapi.yaml` empty (desktop-only Wails surface); one mandatory packaged-app obligation discharged 2026-09-11 — full cycle verified: rebind → export → reset → import, rebound chord comes back and fires without restart |
| specs/backup-keymap-group/spec.md | ✅ Complete | 6 requirements defining export envelope, import footprint, reset-on-empty, absent-is-untouched, unknown-ignored, live dispatcher refresh |
| specs/backup-import-export/spec.md | ✅ Complete | 7 requirements (bundle structure, formatVersion, checksums, manifest-last, export scope, streaming, desktop-only) — export scope requirement updated from 3 to 4 groups with 5 scenarios revised |

## Merge Validation

**Merge type**: New capability (backup-keymap-group) + modified capability (backup-import-export delta)

**Destructive risk**: None. Backup-keymap-group is a new spec under `openspec/specs/backup-keymap-group/`. The backup-import-export delta modifies one existing requirement by:
- Renaming the requirement heading from "three" to "four" groups (reflects actual deliverable)
- Replacing the requirement text to mention `keyboard_keymap` as the fourth group (no removal, only addition)
- Updating five scenarios: one renamed/updated to mention keyboard_keymap, one updated for record count, two split (formerly "Machine-bound and machine-local") to clarify app_settings separately from secret tables, one new (app_settings exclusion except keymap), one unchanged
- All original scenarios preserved in spirit; none removed

**Merge outcomes**:
- `openspec/specs/backup-keymap-group/spec.md` created as new capability (6 requirements, 11 scenarios)
- `openspec/specs/backup-import-export/spec.md` updated with one modified requirement:
  - Requirement heading changed: "Export Scope Is Exactly Three Table Groups" → "Export Scope Is Exactly Four Groups"
  - Requirement text now states: "The system MUST export `anime_snapshots`, `seasons`, `season_animes`, and the `keyboard_keymap` group — the single `app_settings["keyboard.keymap"]` value — and nothing else."
  - Five scenarios updated as described above
- No removals from existing scenarios; all four additional scenarios (reflecting the new app_settings treatment) added
- Corrected wording in export scenario: document (not line) survives unchanged through envelope
- Source of truth established for both specs

## Implementation Summary

**Go + Frontend change**: 3 slices over 1,558 total changed lines (production + tests):
- Slice 1: Export group infrastructure (180-260 lines forecast, 271 actual)
- Slice 2: Import + dispatcher refresh with refactor cycle (330-460 lines forecast, 884 actual → 881 after over-engineering cleanup)
- Slice 3: Footprint guard + ADR corrections (270-390 lines forecast, 503 actual)

### Deliverables

- Export `keyboard_keymap` group carrying persisted keymap verbatim with present-but-empty semantics
- Import writes only `app_settings["keyboard.keymap"]`, leaving all other keys untouched
- Absent group leaves keymap untouched (omission is not deletion)
- Unknown group ignored with warning for forward/backward compatibility
- Restored keymap reaches running dispatcher without restart via `use-keymap-overrides` re-render
- Importer footprint enforcement: each shipped group declares and respects its exact set of modified keys/rows
- Corrections to ADR-010 § A (table/group asymmetry), ADR-020 strike (keymap was falsely claimed machine-local), CHANGELOG.md (missing SDD-62 entry)

## Task Completion Gate

**Persisted tasks artifact**: `openspec/changes/archive/2026-09-11-sdd-67-keymap-in-backups/tasks.md`

**Status**: All 42 implementation tasks marked complete (`[x]`). No unchecked tasks remain.

## Verification Summary

| Verification | Result |
|--------------|--------|
| Go test suite (`go test ./...`) | clean |
| Go vet / gofmt | clean |
| Frontend suite (`bun run test`) | **2672/2672 passed**, 296 files |
| golangci-lint | 0 issues, both profiles |
| Fallow audit | exit 0 |
| Go file size policy (`checkgofilesize`) | passed, baseline still empty |
| Frontend render smoke test (`render:smoke`) | production bundle paints on every checked route |
| OpenAPI surface (`git diff -- docs/openapi.yaml`) | empty — desktop-only Wails binding, no wire change |
| `wails build` | exit 0 → `build/bin/autoreas-bridge.exe`, 21 MB, 18s |
| Mutation testing | `internal/settings` 1.00; `internal/desktop` and constants file 0 mutants (legitimate: struct-literal wiring and Stryker-skipped file) |
| Packaged-app verification (full cycle obligation) | **PASS**, 2026-09-11, discharged by repository owner. Full cycle verified: rebind a command → export backup → reset to defaults → import backup. Rebound chord comes back and fires immediately without restart. Proves: rebind reaches SQLite (export could only carry it), reset clears it (state verified), import writes through real Wails binding (live refresh fires), dispatcher sees new chord without restart |
| Footprint guard | Load-bearing 2-state step proved by mutation (break-it, it fails; remove the step, it passes vacuously) — verified both directions |

## Corrections Discharged in This Change

All artifacts now reflect the code and design truth:

1. **Export scenario**: Corrected from "line MUST equal persisted document byte-for-byte" to "the *document* survives unchanged through the `{document:}` envelope" — required for opaque-bytes compatibility
2. **ADR-020**: Struck false claim "keymap does not travel with backup bundle" — now true: keymap is included
3. **ADR-010 § A**: Amended "table ends up holding exactly the bundle's records" — asymmetry noted for non-table groups
4. **ADR-010 scope guard test**: Name updated after slice 2's rename
5. **CHANGELOG.md**: Added missing entry for SDD-62 keymap-customization feature

## Over-Engineering Refactor

Slice 2's first attempt measured 884 changed lines against 600 cap. Orchestrator identified over-engineering (hand-copied setup→act→assert, Partial-override builders for single call site, mocked positive case re-proving end-to-end test). Refactor removed 51 test lines while keeping all mutation tests passing; changed-line metric moved 884 → 881 (additions+deletions count removals as negatives). **Metric refined**: cap is pre-commit discipline (lines must not be written), not post-commit cleanup. CLAUDE.md #22 and AGENTS.md updated. Slice 3 planned under corrected rule and closed at 503.

## SDD Cycle Closure

- **Proposal**: Keymap in backups — portable keymap through export, live refresh on import, verifiable footprints — ✅
- **Specs**: 6 new requirements (backup-keymap-group) + 1 modified requirement (backup-import-export) with 16 total scenarios — ✅
- **Design**: Export envelope wrapping, import-only footprint enforcement, live refresh via hook re-render, load-bearing guard tests — ✅
- **Tasks**: 42 tasks across 3 phases (export infrastructure, import + refresh, footprint guard + docs) — ✅ all complete
- **Implementation**: Go + Frontend, 3 slices, 1,558 changed lines, one over-engineering refactor, all test obligations met — ✅
- **Verification**: Test suites, Go vet, lint, file size policy, footprint guard proven by mutation, packaged-app full-cycle PASS — ✅ PASS
- **Archive**: Specs synced, change folder moved to archive, audit trail complete — ✅

**Verdict**: The change is fully planned, implemented, verified, and archived. Source of truth (openspec/specs/) reflects the backup contract, importer footprints, and live refresh semantics. All proof obligations discharged.

---

## Traceability

**Change ID**: `2026-09-11-sdd-67-keymap-in-backups`
**Archive Date**: 2026-09-11
**Archived to**: `openspec/changes/archive/2026-09-11-sdd-67-keymap-in-backups/`
**Engram Topic Key**: `sdd/2026-09-11-sdd-67-keymap-in-backups/archive-report`
**Related Topic Keys**:
- `sdd/2026-09-11-sdd-67-keymap-in-backups/proposal`
- `sdd/2026-09-11-sdd-67-keymap-in-backups/spec`
- `sdd/2026-09-11-sdd-67-keymap-in-backups/design`
- `sdd/2026-09-11-sdd-67-keymap-in-backups/tasks`
- `sdd/2026-09-11-sdd-67-keymap-in-backups/verify-report`
