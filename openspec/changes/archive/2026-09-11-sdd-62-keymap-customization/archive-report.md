# Archive Report: 2026-09-11-sdd-62-keymap-customization

**Archived**: 2026-09-11
**Change**: Keymap Customization
**Status**: Complete and verified
**Mode**: hybrid (openspec + engram)

## Executive Summary

The keymap customization feature has been successfully implemented, verified, and archived. The change enables users to rebind any global or scoped keyboard command, view the complete shortcut map in the Settings panel, and recover a working keymap without touching the keyboard. All 102 tasks completed across twelve slices; verification PASS; all requirements proved with comprehensive test coverage including the mandatory packaged-app verification obligation.

## Specs Synced

### Keymap Customization (New)

| Domain | Action | Details |
|--------|--------|---------|
| keymap-customization | Created | New capability: versioned keymap document, override resolution by command id, persistence as opaque string under one settings key, shortcuts panel with loading/error states, chord capture by listening, bind-time conflict detection, recovery paths (per-binding revert + whole-keymap reset) |

**Requirements added**: 7 requirements (`The Keymap Document Is Versioned And Degrades Safely`, `Override Resolution Is Keyed By Command Id`, `Persistence Is One Document Under One Settings Key, Opaque To The Backend`, `The Shortcuts Panel Renders The Complete Map First, With Mandatory Loading And Error States`, `Chord Capture Records By Listening And Never Triggers A Shortcut`, `Bind-Time Conflicts Block On Duplicates And Warn On Cross-Scope Shadowing`, `Recovery Is Always Reachable By Pointer Alone`) with 18 total scenarios proving the behaviour.

### Keyboard Shortcuts (Modified)

| Domain | Action | Details |
|--------|--------|---------|
| keyboard-shortcuts | Modified | Three requirements updated to reference effective (overridden) chords instead of declared chords, scoped command metadata centralized, three new scenarios added (rebound command fires on new chord, enumerable without panel mounted, overridden chord displays in help dialog) |

**Requirements modified**: 3 existing requirements with 3 new scenarios added:
- "The Scope Stack Resolves Commands Innermost-First, Gated By `enabled()`" — added new scenario "A rebound command fires on its new chord and not its old one", updated text to reference effective chord
- ""Mark All As Read" Is Route-Scoped To The Notification Center, Never Global" — added new scenario "The binding is enumerable without the panel being mounted", updated text to require shared declaration
- "The Shortcuts Help Dialog Renders Content Derived From The Registry" — added new scenario "An overridden chord displays identically to what the dispatcher answers to", updated text to mention effective-chord resolution

## Archive Contents

| Artifact | Status | Details |
|----------|--------|---------|
| proposal.md | ✅ Complete | Keymap customization intent, scope, approach (override seam, persistence, UI panel, conflict surfacing, recovery), sizing (12 slices), timeline |
| design.md | ✅ Complete | Technical approach: store read seam, per-keystroke resolution via effectiveChord, Go as opaque pipe, vanilla Zustand store, dispatch algorithm, capture by listening, conflict detection and shadow warnings, recovery paths, documentation mandate |
| tasks.md | ✅ Complete | 12 slices (62a-62l), 102 tasks total (all marked complete with `[x]`) — pure helper and infrastructure proofs (keymap resolution, conflict detection, Go persistence), React component and hook wiring, dispatch and overlay seam threading, chord capture control, conflict/shadow surfacing with persist-then-publish, recovery affordances, documentation |
| verify-report.md | ✅ Complete | Verification PASS; 2665/2665 frontend tests passed, clean Go test suite, typecheck clean, ESLint clean, render:smoke clean, layout:smoke 66px drift 0, mutation testing with per-slice measurements, fallow audit clean; one mandatory packaged-app obligation discharged 2026-09-11 — rebinding and Reset both work in packaged binary; persistence verified through export cycle |
| specs/keymap-customization/spec.md | ✅ Complete | 7 requirements defining versioned document, resolution, persistence, panel rendering, capture, conflict surfacing, recovery |
| specs/keyboard-shortcuts/spec.md | ✅ Complete | 7 requirements (keyboard registry, normalization, scope stack, dispatcher, nav commands, mark-all-read, help dialog) — 3 modified to reference effective chords and include new scenarios |

## Merge Validation

**Merge type**: New capability (keymap-customization) + modified capabilities (keyboard-shortcuts delta)

**Destructive risk**: None. Keymap-customization is a new spec under `openspec/specs/keymap-customization/`. The keyboard-shortcuts delta modifies three existing requirements by:
- Replacing the requirement text to mention effective chord resolution (no removal, only clarification)
- Adding three new scenarios (no existing scenarios removed)
- The modifications are all additive and preserve all original scenarios

**Merge outcomes**:
- `openspec/specs/keymap-customization/spec.md` created as new capability (7 requirements, 18 scenarios)
- `openspec/specs/keyboard-shortcuts/spec.md` updated with three modified requirements (text updated to reference effective chords, 3 new scenarios appended):
  - Requirement "The Scope Stack Resolves Commands Innermost-First, Gated By `enabled()`": text now includes "comparing against each command's **effective** chord — its stored user override if one exists for the command's id, otherwise its declared chord"; added scenario "A rebound command fires on its new chord and not its old one"
  - Requirement ""Mark All As Read" Is Route-Scoped To The Notification Center, Never Global": text now includes "Its id, scope, chord, label, and section MUST be declared in one place shared across the app, so the binding is enumerable even while the panel is not mounted"; added scenario "The binding is enumerable without the panel being mounted"
  - Requirement "The Shortcuts Help Dialog Renders Content Derived From The Registry": text now includes "resolving each binding's displayed chord through the same effective-chord rule the dispatcher uses"; added scenario "An overridden chord displays identically to what the dispatcher answers to"
- No removals or modifications to existing scenarios in keyboard-shortcuts
- Source of truth established for both specs

## Implementation Summary

**Frontend-only change**: ~3,357 total changed lines across twelve chained PRs (production code ~1,626 lines, test code ~2,116 lines, documentation ~710 lines per project estimate).

### Deliverables

- S-1: Keymap document + resolution helpers (pure parse/serialize/resolve functions)
- S-2: Go persistence (opaque string storage under one key, no validation)
- S-3: Override seam (dispatcher, help dialog, scope frames all resolve effective chord)
- S-4: Scoped chord metadata centralized (SCOPED_COMMAND_BINDINGS)
- S-5: Shortcuts panel in Settings (complete map first, mandatory loading/error states)
- S-6: Chord capture by listening (preventDefault blocks dispatch)
- S-7: Bind-time conflict surfacing (reuse findDuplicateBindings)
- S-8: Recovery paths (per-binding revert + whole-keymap reset)
- S-9: Documentation (ADR-019 correction, ADR-020, skill update, CLAUDE.md #23)

## Task Completion Gate

**Persisted tasks artifact**: `openspec/changes/archive/2026-09-11-sdd-62-keymap-customization/tasks.md`

**Status**: All 102 implementation tasks marked complete (`[x]`). No unchecked tasks remain.

## Verification Summary

| Verification | Result |
|--------------|--------|
| Frontend test suite (`bun run test`) | **2665/2665 passed**, 294 files |
| Type checking (`tsc --noEmit`) | clean |
| Go test suite (`go test ./...`) | clean — zero `.go` files touched |
| ESLint | clean on every file the chain touched |
| Fallow audit | exit 0 |
| Frontend render smoke test (`render:smoke`) | production bundle paints on every checked route |
| Frontend layout smoke test (`layout:smoke`) | KeymapPanelSkeleton measured at 66px against 66px row, drift 0 |
| `wails build` | exit 0 → `build/bin/autoreas-bridge.exe` |
| Mutation testing | per-slice measurements; slice 3 93.94%, slice 4 96.97%; three accepted equivalent mutants documented in source |
| Packaged-app verification (task 62c obligation) | **PASS**, 2026-09-11, discharged by repository owner. Rebinding and Reset both work in packaged binary. Persistence verified through SDD-67's export cycle — the rebind value genuinely reached SQLite through the real Wails binding |

## SDD Cycle Closure

- **Proposal**: Keymap customization — user-rebindable commands, complete map panel, conflict surfacing, recovery without keyboard — ✅
- **Specs**: 7 new requirements (keymap-customization) + 3 modified requirements (keyboard-shortcuts delta) with 21 total scenarios — ✅
- **Design**: Override seam read at dispatch time, pure resolution functions, opaque Go persistence, React component architecture, mandatory loading/error states, capture by listening — ✅
- **Tasks**: 102 tasks across 12 phases (primitives, Go persistence, seam wiring, panel infrastructure, binding row component, panel structure, accessible states, capture control, conflict/shadow wiring, recovery, documentation) — ✅ all complete
- **Implementation**: Frontend-only, ~3,357 lines, twelve chained PRs each 260–475 lines, all CLAUDE.md constraints respected — ✅
- **Verification**: Test suites (2665 passed), typecheck, lint, file size policy, packaged-app check PASS — ✅ PASS
- **Archive**: Specs synced, change folder moved to archive, audit trail complete — ✅

**Verdict**: The change is fully planned, implemented, verified, and archived. Source of truth (openspec/specs/) reflects the new behavior. All proof obligations discharged.

---

## Traceability

**Change ID**: `2026-09-11-sdd-62-keymap-customization`
**Archive Date**: 2026-09-11
**Archived to**: `openspec/changes/archive/2026-09-11-sdd-62-keymap-customization/`
**Engram Topic Key**: `sdd/2026-09-11-sdd-62-keymap-customization/archive-report`
**Related Topic Keys**:
- `sdd/2026-09-11-sdd-62-keymap-customization/proposal`
- `sdd/2026-09-11-sdd-62-keymap-customization/spec`
- `sdd/2026-09-11-sdd-62-keymap-customization/design`
- `sdd/2026-09-11-sdd-62-keymap-customization/tasks`
- `sdd/2026-09-11-sdd-62-keymap-customization/verify-report`
