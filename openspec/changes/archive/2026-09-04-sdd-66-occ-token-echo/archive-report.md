# Archive Report: SDD-66 — OCC token echo on applied operations

**Date:** 2026-09-04  
**Branch:** `test/bridge-sync-contract-fixes`  
**Commit:** `f2612ee` (full pre-commit gate passed)  
**Status:** Complete — implemented, verified, and committed

## Executive Summary

SDD-66 ships optimistic concurrency control (OCC) token echo on applied operations for the mobile sync reconcile endpoint, turning a batch-aborting conflict into a per-operation outcome that preserves the full response body. All 23 tasks delivered; full gate verification passed; mutation score 1.00 (5 mutants, 5 killed).

## Change Closure

### Scope Delivered

- **Infrastructure (1.1):** Two optional fields (`ModifiedAt *int64`, `Reason`) on `contracts.AppliedOperation`, with closed-vocabulary `AppliedOperationReason` enum. Pointer type ensures `0` is a valid live token.
- **Testing (2.1–2.7b):** Eight test tasks covering four branches (applied, no-op, conflict, skipped) plus integration cases and the intra-batch conflict guard, all passing with mutation score 1.00.
- **Implementation (3.1–3.9):** Non-fatal conflict handling via `errors.Is(err, ErrAnimePatchConflict)` inside `applyPendingOperations`; unchanged PATCH seam by construction; per-operation outcome matrix fully implemented.
- **Spec & Docs (4.1–4.4):** Delta spec merged into main spec; `docs/openapi.yaml` updated with new fields, closed-vocabulary `reason` enum, and corrected conflict behavior note.

### Measured Results

**Gate Status:** All exit 0
- `go build ./...` ✓
- `go vet ./...` ✓
- `go test ./...` ✓
- `go run ./tools/checkgofilesize` ✓
- `golangci-lint` ✓
- `bun --cwd="frontend" run build` ✓
- `bun --cwd="frontend" run render:smoke` ✓
- `wails build` ✓
- `wails dev` (starts fully — Vite on :5174, bindings generated, app compiled, DevServer on :34115, watcher active) ✓

**Test Coverage & Mutations**
- Mutation command: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/api/handlers/"`
- Result: 5 mutants, 5 killed, 0 survived
- **Mutation score: 1.00** (exceeds 0.80 threshold)

**Code Size & Exception**
- Changed lines: **462** (333 tests, 129 production/docs)
- Budget: 400 lines
- Exception: `size:exception` recorded — conflict fix is a hard prerequisite for token echo; splitting would ship an untestable intermediate state (sync returns conflict via HTTP 202 but client has no way to learn its next OCC base token). Full reasoning recorded in `tasks.md` under "MEASURED RESULT".

### Implementation Highlights

**Intra-Batch Conflict Guard (Late Addition)**
A base-less operation after a conflict on the same anime is not applied. This was not in the first design draft but was added during implementation after recognizing a gap: without this guard, a batch could have its first operation for a record correctly rejected as a conflict, then a later base-less operation for the same record silently overwrite the very value the rejection protected. This is fully reflected in:
- Spec: New scenarios "A base-less operation after a conflict on the same anime is not applied" (req §34–36)
- Design: Intra-batch tracking section
- Tasks: Task 2.7b with two test variants (base-less after conflict, and based operation after conflict)
- Implementation: `applyPendingOperations` tracks conflicted anime IDs within the batch

**Per-Branch Field Matrix (Verified Intact)**
The four branches each emit the correct combination of `applied`, `modified_at`, and `reason`:
- **Applied:** `applied: true`, `modified_at` present (new token), `reason` absent
- **No-op:** `applied: true`, `modified_at` present (unchanged token, including 0), `reason` absent
- **Conflict:** `applied: false`, `modified_at` present (winning token), `reason: "conflict"`
- **Skipped:** `applied: false`, `modified_at` omitted (never computed), `reason: "unsupported_operation"`

**PATCH Seam Unchanged by Construction**
- `AdaptAnimePatchWriter` (`common.go:98–113`) — unchanged
- `anime_handler.go` — unchanged
- Chosen approach (`errors.Is` inside the loop) leaves both callers' error contracts unmodified
- Three named guards verified byte-identical:
  - `common_outcome_test.go:19–63` ("conflict → 500 `patch anime failed`")
  - `common_outcome_test.go:69–100` ("conflict → `errors.Is(err, ErrAnimePatchConflict)`")
  - `anime_handler_helpers_test.go:70–84` ("conflict ID reaches capture correlations")

### Verification Artifacts

**Spec Merge Status**
- Delta spec (`specs/mobile-sync-contract/spec.md`) merged into main spec
- Requirement description updated with full token echo and intra-batch guard semantics
- Original three scenarios preserved and extended:
  1. "Reconcile request with compatibility body" (unchanged)
  2. "Pending update operations are applied compatibly during reconcile" (extended with `modified_at`)
  3. "Unsupported pending operations are ignored during reconcile" (reordered, updated with new reason field)
- Seven new scenarios added:
  1. "Applied pending operation echoes its new token"
  2. "No-op pending operation echoes the bridge's unchanged token, including zero"
  3. "Conflict is reported per-operation without aborting the batch"
  4. "A mixed batch preserves submission order and outer response fields"
  5. "A base-less operation after a conflict on the same anime is not applied"
  6. "A based operation after a conflict on the same anime is still evaluated"
  7. "Reason is absent whenever an operation is applied"

## Follow-Ups & Known Issues

These items were out of scope per the proposal but require explicit team attention:

### 1. Mobile sending `base` — Unblocked (READY FOR MOBILE SDD)
**Location:** Autoreas Mobile repository  
**Status:** This change removes the blocker. Mobile can now send `base` and receive conflict outcomes without losing the full response body.  
**Next:** Autoreas Mobile team initiates their own SDD for base-sending.

### 2. **PATCH Reports Conflict as HTTP 500 (Spec-vs-Test Contradiction)**
**Locations:**
- `docs/openapi.yaml:804–810`: Documents that a base mismatch "never blocks the write"
- `internal/api/handlers/common_outcome_test.go:34–41`: Pins conflict → HTTP 500 named "conflict is not reported as success"

**Status:** Unresolved design question  
**Impact:** Asymmetry — `patchCaptureErrorCode` records `"patch_conflict"` for activity tracking, but the client sees HTTP 500.  
**Recommendation:** Separate change. Three reasons:
- Requires deciding if the correct fix is 409 Conflict or 200 with conflict indicator (spec does not say)
- Would add 80–150 lines (PATCH response, spec delta, updated contracts.go)
- No live victim in mobile (no PATCH path) vs. scheduled victim on reconcile 500 when mobile ships base

**Decision Required:** Clarify if `docs/openapi.yaml:804–810` is the intended spec or if a conflict should actually return 409.

### 3. Dead `OCCObserveOnly` Flag
**Locations:**
- Declared: `internal/anime/write_service.go:60`
- Set true (production): `internal/desktop/app.go:313`, `internal/desktop/app_runtime_services.go:252`
- Read nowhere

**Status:** Never enforced  
**Comment in Code:** "flip to false to enable full enforcement"  
**Action:** Remove or document its purpose. If enforcement is intentional, implement the reader and add a test.

### 4. Deleted `docs/sync-occ-mobile-contract.md` Still Referenced
**Deleted by:** Commit `58b0c98` ("remove obsolete docs")  
**Referenced in:** `internal/desktop/app_runtime_services.go:242`  
**Status:** Live code still points to deleted documentation  
**Action:** Either restore the doc (if staged rollout is incomplete) or remove the reference and update the comment.

### 5. Breaking Change: Removing `conflicts []any` From `ReconcileResponse`
**Location:** `contracts.ReconcileResponse`  
**Current Status:** Field exists; always emitted as `[]` (empty array)  
**Proposal Design:** Keep emitting for compatibility; mark deprecated in schema  
**Breaking Change Note:** Any consumer doing `response.conflicts.length` (checking for conflict count) would break on removal  
**Action:** Announce deprecation now; remove in a separate announced breaking-change release after consumer confirmation.

### 6. `cap_plus`/`cap_minus` Never Reach `isPendingPatchOperation`
**Locations:**
- `internal/desktop/app_runtime_services.go:268–271`: Sets `cap_plus` and `cap_minus`
- `internal/api/handlers/common_gateway.go:206`: `isPendingPatchOperation` check
- Never connected

**Status:** Cap operations always land in the skipped branch  
**Impact:** Cap operations are never applied through the reconcile path  
**Action:** Either implement the connection (requires mobile SDD) or document that cap operations are not mobile-sync-capable.

## Traceability

**Observation IDs & Artifacts**

| Item | Location | Status |
|------|----------|--------|
| Proposal | `proposal.md` | Archived in `openspec/changes/archive/2026-09-04-sdd-66-occ-token-echo/` |
| Spec | `specs/mobile-sync-contract/spec.md` | Merged into main |
| Design | `design.md` | Archived |
| Tasks | `tasks.md` | All 23 tasks complete; archived |
| Verify Report | (provided by orchestrator) | Commit f2612ee verified; all gates pass |
| Archive Report | This document | Location: `openspec/changes/archive/2026-09-04-sdd-66-occ-token-echo/archive-report.md` |

## What's Changed

### Core Files Modified

| File | Change | Lines |
|------|--------|-------|
| `internal/api/contracts/contracts.go` | Added `AppliedOperationReason` type and two constants; added `ModifiedAt`, `Reason` fields to `AppliedOperation` | +12 |
| `internal/api/handlers/sync_handler.go` | Non-fatal conflict handling; per-operation outcome matrix; dead clause removed | +25 (net) |
| `internal/api/handlers/sync_handler_occ_token_test.go` | New file; 6 test functions covering branches and intra-batch guard | +330 |
| `internal/api/handlers/sync_handler_test.go` | Strengthened 2 existing tests (JSON-level assertions for field presence/absence) | +8 |
| `docs/openapi.yaml` | Corrected false "unchanged" claim; added `modified_at` and `reason` to schema; marked `conflicts` deprecated | +45 |
| `openspec/specs/mobile-sync-contract/spec.md` | Merged delta spec; updated requirement description and scenarios | +103 |

### Tests (All Passing, Mutation Score 1.00)

- `sync_handler_occ_token_test.go`: 6 new test functions
  - `TestSyncHandlerNoOpEchoesZeroModifiedAt` — regression guard for pointer-vs-`omitempty`
  - `TestSyncHandlerReportsConflictAsPerOperationOutcome` — conflict is non-fatal, returns 202
  - `TestSyncHandlerMixedBatchPreservesOrderAndOuterFields` — batch continues, order preserved
  - `TestSyncHandlerNonConflictWriterErrorStillAborts` — regression guard: only conflict is non-fatal
  - `TestSyncHandlerRecordsConflictOutcomeInCaptureCorrelations` — conflict outcome captured
  - Intra-batch conflict guard tests (two variants)
- `sync_handler_test.go`: 2 strengthened tests with JSON-level field assertions
- All existing tests pass unmodified

## Rollback Procedure

Single-commit `git revert f2612ee` if needed before mobile ships `base`. After mobile armament, rollback returns them to HTTP 500 on conflict (the very trap this change exists to prevent).

## Commit History

```
f2612ee fix(sync): token echo on applied operations, conflict non-fatal
  - AppliedOperation gains ModifiedAt (pointer, legitimate 0) and Reason (enum)
  - Conflict inside applyPendingOperations is caught and per-op, not batch-aborting
  - Intra-batch conflict guard prevents base-less ops after conflict on same anime
  - Spec updated with 7 new scenarios covering token echo and guard behavior
  - Mutation score 1.00 (5/5 killed); all gates pass
```

**Gate Status at Commit:** ✓ Full pre-commit pass (90s ~, all concurrent groups)

---

## Closure Checklist

- [x] Change is fully implemented (all 23 tasks complete)
- [x] Spec merged (delta → main)
- [x] Change folder archived
- [x] All verification gates pass (go build, go vet, go test, checkgofilesize, linters, frontend, wails)
- [x] Mutation score meets threshold (1.00 ≥ 0.80)
- [x] PATCH seam verified unchanged (three named guards byte-identical)
- [x] Token echo confirmed on success paths
- [x] Conflict non-fatal with full response body preserved
- [x] Intra-batch guard implemented and tested
- [x] Follow-ups documented and handed off

**Status: COMPLETE AND ARCHIVED**

Date archived: 2026-09-04  
Orchestrator: Primary session  
Executor: sdd-archive agent
