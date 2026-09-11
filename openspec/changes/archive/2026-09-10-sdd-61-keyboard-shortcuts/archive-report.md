# Archive Report: 2026-09-10-sdd-61-keyboard-shortcuts

**Archived**: 2026-09-11
**Change**: Keyboard Shortcuts Infrastructure
**Status**: Complete and verified
**Mode**: hybrid (openspec + engram)

## Executive Summary

The keyboard shortcuts infrastructure has been successfully implemented, verified, and archived. The change defines a typed command registry, pure chord normalization and formatting, a vanilla scope stack readable outside React, one global dispatcher with four guard conditions, ten navigation commands derived from the nav constant, a route-scoped "mark all as read" command for the Notification Center, and a help dialog rendered directly from the registry. All 39 tasks completed across four slices; verification PASS; all 7 requirements proved with test coverage including the WebView2 manual verification obligation.

## Specs Synced

### Keyboard Shortcuts (New)

| Domain | Action | Details |
|--------|--------|---------|
| keyboard-shortcuts | Created | New capability: typed command registry, chord normalization, scope stack, global dispatcher with guards, ten navigation commands, notification-scoped "mark all as read", help dialog |

**Requirements added**: 7 requirements (registry, chord normalization, scope resolution, global dispatcher, ten nav commands, notification-scoped command, help dialog) with 14 total scenarios proving the behaviour.

## Archive Contents

| Artifact | Status | Details |
|----------|--------|---------|
| proposal.md | ✅ Complete | Keyboard shortcuts infrastructure intent, architecture overview, scope stack design, dispatcher algorithm, help dialog strategy, proof obligations (React Aria coexistence, WebView2 manual check) |
| design.md | ✅ Complete | Technical approach: chord normalization with cross-layout equivalence, vanilla Zustand store for scope stack, dispatch algorithm with four guard conditions, React dispatcher hook, notification-scoped binding, help dialog UI pattern |
| tasks.md | ✅ Complete | 4 phases (primitives, registry+algorithm, React wiring, help dialog+verification), 39 tasks total (all marked complete with `[x]`) — pure function proofs, dispatch state machine, integration tests, manual WebView2 check |
| verify-report.md | ✅ Complete | Verification PASS; 2525/2525 frontend tests passed, 73/73 subsystem tests, typecheck clean, go test clean, zero `.go` files touched, ESLint clean, render:smoke clean; R-4 proof obligation (React Aria preventDefault) discharged; WebView2 chord delivery validated by repository owner 2026-09-11; task 4.3.3 manually confirmed PASS |
| specs/keyboard-shortcuts/spec.md | ✅ Complete | 7 requirements defining registry, normalization, scope resolution, dispatcher guards, ten nav commands, notification-scoped command, help dialog |

## Merge Validation

**Merge type**: New capability (no Modified Capabilities)

**Destructive risk**: None. This is a new spec under `openspec/specs/keyboard-shortcuts/` with no existing content to reconcile.

**Outcome**:
- `openspec/specs/keyboard-shortcuts/spec.md` created as new capability (7 requirements, 14 scenarios)
- No modifications to existing specs
- Source of truth established; no conflicts

## Known Limitations and Deliberate Deferrals

The verify report identified three limitations this change deliberately did not fix, carried forward from the design:

1. **Keyboard layouts with no Latin letters get no letter chords**: A keyboard layout without Latin letter keys (e.g., pure non-Latin script layout) will receive digit chords (`0–9`) and the `?` chord but no letter chords (`A–Z`). The fix is recorded in ADR-019 §4; no affected user is known. SDD-62 (keymap customization) will not resolve this because the core issue is at generation time, not runtime binding.

2. **Scoped command chords are not remappable**: The "mark all as read" chord (`alt+r`) is declared inline in `use-notification-keyboard-scope.ts`, so the "keymap is separable from the commands" property holds for navigation commands only. This is an overstated claim in ADR-019; SDD-62 will make scoped bindings remappable as part of the full keymap system.

3. **Customized keymaps will not travel in backup bundles**: `internal/desktop/app_backup.go:37-41` excludes `app_settings` deliberately. Keymaps will not survive a backup/restore cycle until that exclusion is lifted or keymaps move into a backed-up location. Not a defect of this change; relevant input to SDD-62.

## Dependencies and Follow-ups

### Hard Dependency: SDD-62 Keymap Customization

SDD-62 (`2026-09-11-sdd-62-keymap-customization`) is already open and has a hard dependency on this archive: it cannot write a delta spec against `openspec/specs/keyboard-shortcuts/spec.md` until this file exists. Archive closure unblocks SDD-62 design and tasks phases.

### Known Inconsistency (Owned by SDD-60)

`openspec/specs/desktop-navigation/spec.md` specifies "exactly 9 nav items" in its scenario. The shipped code contains **10** navigation items (`/notifications` was added by SDD-60 in `2026-08-23-sdd-60-notification-center/`). This inconsistency is SDD-60's to resolve — SDD-60 is still unarchived and holds the delta spec reconciling `desktop-navigation`. Per CLAUDE.md #2, the code wins; this document records the condition as a known, owned-elsewhere state so the next reader does not file it as a defect or attempt to "fix" it here.

### Out-of-Scope Commit

Commit `0350712` ("gate fix: move typecheck into frontend lane") was outside this change's scope. Three commit attempts failed because `tsc` sat in lefthook's cheap-checks group and starved the vitest suite beside it, inflating two `*.windowing.test.tsx` rails from 454ms to almost six seconds. Both timeout escapes are `no-restricted-syntax` errors in `frontend/eslint.config.js`, which the linter correctly identified as a root cause. The fix was necessary to unblock the final slice commits and is recorded separately in the verify report's "Deviations from the plan" section.

## Archive Folder

```
openspec/changes/archive/2026-09-10-sdd-61-keyboard-shortcuts/
├── proposal.md
├── design.md
├── tasks.md
├── verify-report.md
├── archive-report.md (this document)
└── specs/
    └── keyboard-shortcuts/spec.md
```

All artifacts present; full audit trail preserved.

## Verification Summary

| Verification | Result |
|--------------|--------|
| Frontend test suite (`bun run test`) | 2525/2525 passed, 281 files |
| Subsystem suite (keyboard, ShortcutsHelp, KeyboardDispatcher, notification scope) | 73/73 passed, 11 files |
| Type checking (`tsc --noEmit`) | clean |
| Go test suite (`go test ./...`) | clean — zero `.go` files touched by this change |
| ESLint | clean on every file this change added |
| Frontend render smoke test (`render:smoke`) | clean |
| Mutation testing | 100% on slice 1–2 production files; 93.94% slice 3; 96.97% slice 4; three accepted equivalent mutants documented in source |
| Orphan value exports | none — every export checked against its importers |
| Go file size policy | pass |
| Frontend file size policy | pass |
| WebView2 manual verification (task 4.3.3) | **PASS**, 2026-09-11, validated by repository owner in packaged app. No chord was changed. **Evidence source**: repository owner attestation. |
| R-4 proof obligation (React Aria coexistence) | **PASS**, discharged by `KeyboardDispatcherListener.react-aria.test.tsx`: proves `preventDefault` is observed by bubble-phase listener before dispatcher runs, and widgets retain their own behavior without double-trigger |

## SDD Cycle Closure

- **Proposal**: Keyboard shortcuts infrastructure — typed registry, pure chord normalization, scope stack, global dispatcher with guards, help dialog — ✅
- **Specs**: 7 requirements (registry, normalization, scope resolution, dispatcher, nav commands, notification command, help dialog) with 14 scenarios — ✅
- **Design**: Chord normalization with cross-layout equivalence, vanilla Zustand store, dispatch algorithm, React wiring, notification scope hook, help dialog pattern — ✅
- **Tasks**: 39 tasks across 4 phases (primitives, registry+algorithm, React wiring, help dialog+verification) — ✅ all complete
- **Implementation**: Frontend-only, ~2,050 lines (tests ~half), four slices each 330–460 lines, chained PRs, all CLAUDE.md constraints respected — ✅
- **Verification**: Test suites (2525+73 passed), typecheck, lint, file size policy, R-4 proof obligation discharged, WebView2 manual check PASS — ✅ PASS
- **Archive**: Specs synced, change folder moved to archive, audit trail complete — ✅

**Verdict**: The change is fully planned, implemented, verified, and archived. SDD-62 is unblocked. Ready for the next change.

---

## Traceability

**Change ID**: `2026-09-10-sdd-61-keyboard-shortcuts`
**Committed**: 10 commits (refs in verify report's Commits table)
**Archive Date**: 2026-09-11
**Engram Topic Key**: `sdd/2026-09-10-sdd-61-keyboard-shortcuts/archive-report`
**Related Topic Keys**:
- `sdd/2026-09-10-sdd-61-keyboard-shortcuts/proposal`
- `sdd/2026-09-10-sdd-61-keyboard-shortcuts/spec`
- `sdd/2026-09-10-sdd-61-keyboard-shortcuts/design`
- `sdd/2026-09-10-sdd-61-keyboard-shortcuts/tasks`
- `sdd/2026-09-10-sdd-61-keyboard-shortcuts/verify-report`
