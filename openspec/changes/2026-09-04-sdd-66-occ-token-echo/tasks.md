# Tasks: SDD-66 — OCC token echo on applied operations

Ordering note: this repo's cycle is **RED -> GREEN -> MUTATE -> REFACTOR**
(`AGENTS.md` #16). The "Testing" phase therefore precedes "Implementation"
below — every production-code task in section 3 is preceded by the failing
test(s) that justify it in section 2. Do not write section 3 before section 2
is complete and its failures have been observed for the right reason.

Traceability: scenario names in brackets refer to
`specs/mobile-sync-contract/spec.md`, requirement "Sync Reconcile Returns
Bridge Changes".

## 1. Infrastructure

- [x] **1.1** In `internal/api/contracts/contracts.go:284-289`, add the closed-vocabulary
  `AppliedOperationReason` type, its two constants, and the two new optional fields on
  `AppliedOperation`, exactly per design's Interfaces/Contracts section:

  ```go
  type AppliedOperationReason string

  const (
      AppliedOperationReasonUnsupportedOperation AppliedOperationReason = "unsupported_operation"
      AppliedOperationReasonConflict             AppliedOperationReason = "conflict"
  )

  type AppliedOperation struct {
      AnimeID    string                 `json:"anime_id"`
      Operation  string                 `json:"operation"`
      Applied    bool                   `json:"applied"`
      ModifiedAt *int64                 `json:"modified_at,omitempty"`
      Reason     AppliedOperationReason `json:"reason,omitempty"`
  }
  ```

  `ModifiedAt` MUST be `*int64` (pointer), never a plain `int64` — `0` is a
  legitimate live token in this codebase (see design's "Decision:
  `ModifiedAt *int64`"). This step is purely additive: no caller sets the new
  fields yet, so `go build ./...` and every existing test still pass with the
  fields silently absent from every response body (`omitempty` on an unset
  pointer/empty string).
  - Verify: `go build ./...` exit 0; `go test ./internal/api/...` still green (baseline, no new assertions yet).

Parallelizable: none — this is the single prerequisite for 2.7's compile step and for all of section 3.

## 2. Testing — RED (write and observe failing before any production code change)

Tasks 2.1-2.7 have no ordering dependency on each other and may be done in any
order or batched together; 2.9 depends on all of them being written first.

- [x] **2.1** In `internal/api/handlers/sync_handler_test.go`, strengthen
  `TestSyncHandlerAppliesPendingUpdateOperationsBeforeReturning` (currently
  `:248-300`, its stub already returns `ModifiedAt: 1000` at `:263`). After the
  existing struct-level checks at `:296-299`, decode `res.Body.Bytes()` into
  `[]map[string]json.RawMessage` (NOT back into `ReconcileResponse` — a
  struct-level round-trip cannot detect a wrong-but-symmetric tag) and assert:
  the single entry's `"modified_at"` key is present and unmarshal-equals `1000`;
  the `"reason"` key is **absent** from the map entirely.
  [Scenarios: "Applied pending operation echoes its new token", "Reason is
  absent whenever an operation is applied"]

- [x] **2.2** In `internal/api/handlers/sync_handler_test.go`, strengthen
  `TestSyncHandlerIgnoresNonUpdatePendingOperations` (currently `:359-402`, the
  skipped/`delete` branch). After the existing checks at `:398-401`, decode into
  `[]map[string]json.RawMessage` and assert: the `"modified_at"` key is
  **absent** (not `null`, not `0`); the `"reason"` key is present and
  unmarshal-equals `"unsupported_operation"`.
  [Scenario: "Unsupported pending operations are ignored during reconcile"]

- [x] **2.3** Create `internal/api/handlers/sync_handler_occ_token_test.go`
  (new file — `sync_handler_test.go` is at 402 raw lines against the repo's
  400-line warning). Add `TestSyncHandlerNoOpEchoesZeroModifiedAt`: stub
  `ApplyPendingPatch` to return `contracts.AnimePatchResult{AnimeID: id,
  Outcome: contracts.AnimePatchOutcomeNoOp, ModifiedAt: 0}, nil`. Decode the
  response into `[]map[string]json.RawMessage` and assert the entry's
  `"modified_at"` key is present with raw JSON `"0"` (i.e. the key exists, its
  value is the literal `0`, not omitted) and `"reason"` is absent. This is the
  pointer-vs-`omitempty` regression test: a plain `int64` `ModifiedAt` would
  silently drop this key.
  [Scenario: "No-op pending operation echoes the bridge's unchanged token,
  including zero"]

- [x] **2.4** In the same new file, add
  `TestSyncHandlerReportsConflictAsPerOperationOutcome`: stub
  `ApplyPendingPatch` to return `contracts.AnimePatchResult{AnimeID: id,
  Outcome: contracts.AnimePatchOutcomeConflict, ModifiedAt: 900},
  fmt.Errorf("%w: anime=%s", ErrAnimePatchConflict, id)` — mirror
  `AdaptAnimePatchWriter`'s own wrapping (`common.go:108`) so `errors.Is`
  is exercised the same way production wraps it, not a stub-only shortcut.
  Assert: HTTP status is **202** (not 500); the response still decodes
  successfully; the entry has `applied: false`, `"reason":"conflict"`, and
  `"modified_at"` present and equal to `900`; `last_changelog_id` and
  `bridge_changes` are still present in the body.
  [Scenario: "Conflict is reported per-operation without aborting the batch"]

- [x] **2.5** In the same new file, add
  `TestSyncHandlerMixedBatchPreservesOrderAndOuterFields`: submit three
  `pending_operations` in this order — one `update` the stub applies, one
  `update` the stub reports as a conflict, one `delete` (skipped) — using a
  stub that branches on `anime_id`. Decode into
  `[]map[string]json.RawMessage` and assert: exactly 3 entries, in submission
  order; entry 1 has `applied:true`, `reason` absent, `modified_at` present;
  entry 2 has `applied:false`, `reason:"conflict"`, `modified_at` present;
  entry 3 has `applied:false`, `reason:"unsupported_operation"`,
  `modified_at` absent; HTTP status 202; `last_changelog_id` and
  `bridge_changes` still present and correct.
  [Scenario: "A mixed batch preserves submission order and outer response
  fields"]

- [x] **2.6** In the same new file, add
  `TestSyncHandlerNonConflictWriterErrorStillAborts`: stub
  `ApplyPendingPatch` to return a plain `errors.New("boom")` — deliberately
  **not** wrapping `ErrAnimePatchConflict`. Assert the batch still aborts
  with HTTP **500** and body `"apply pending operation failed"`, exactly as
  today. This is the regression guard proving the new `errors.Is` branch does
  not over-match and swallow a genuine infrastructure failure (invalid input,
  writer unavailable, or the adapter's own "unexpected anime patch outcome"
  default all stay fatal).
  [Design: "only a conflict becomes non-fatal"]

- [x] **2.7** In the same new file, add
  `TestSyncHandlerRecordsConflictOutcomeInCaptureCorrelations`: use the
  `enrichedReconcileRequest` helper (`sync_handler_test.go:242`, already
  shared across the package) with a conflict-stubbed `ApplyPendingPatch`, call
  `requestcapture.MergeEnrichment(requestcapture.CaptureRecord{}, enr)`
  (pattern already used at `sync_handler_test.go:168` and `:198`), and assert
  `record.Correlations.OperationRefs` contains an entry for the conflicting
  `anime_id` with `Outcome == "conflict"` — not `"skipped"`. This is the one
  test protecting `operationRefsFromAppliedOperations`'s reason-derived
  mapping; test the public capture-correlation outcome, not the unexported
  function directly.
  [Design decision: "a conflict is recorded as `\"conflict\"` in capture
  correlations"]

- [x] **2.7b** In `internal/api/handlers/sync_handler_occ_token_test.go`, add the
  intra-batch guard tests. Batch of two `update` operations for the SAME
  `anime_id`, first with a stale `base` (stub returns conflict), second
  **omitting `base` entirely**. Assert: HTTP 202; both entries
  `applied: false` with `reason: "conflict"`; both carry the same
  `modified_at`; and critically, that the writer was **NOT called for the
  second operation** (count stub invocations — this is the assertion that
  proves data was not overwritten, and the only one that fails if the guard
  is missing). Then a second test: same shape but the second operation
  **carries a `base` matching the current token** — assert it IS applied
  (`applied: true`, `reason` absent) and the writer WAS called, proving the
  guard is scoped to base-less operations and does not refuse legitimate
  client-justified writes.
  [Scenarios: "A base-less operation after a conflict on the same anime is
  not applied", "A based operation after a conflict on the same anime is
  still evaluated"]

- [x] **2.8** Run `go test ./internal/api/handlers/... -run TestSyncHandler -v`.
  Confirm every test touched/added in 2.1-2.7 **fails**, and record why each
  one fails (missing JSON key / wrong status code / wrong outcome string) —
  not a compile error. A compile error here means 1.1 was skipped or is
  incomplete; a pass here means the assertion is not exercising new behavior.

## 3. Implementation — GREEN

Do not start until 2.8 has been run and every new/updated assertion is
confirmed RED for the right reason.

- [x] **3.1** Rewrite the loop body of `applyPendingOperations`
  (`internal/api/handlers/sync_handler.go:159-180`) to the shape in design's
  "Loop Shape After the Change":
  - Skipped branch (`!isPendingPatchOperation`): set
    `Reason: contracts.AppliedOperationReasonUnsupportedOperation`;
    `ModifiedAt` stays `nil` (never call the writer, so no token exists).
  - Decode/nil-writer guards: unchanged, still `return nil, ...`.
  - After `result, err := applyPendingPatch(...)`, replace the
    `if err != nil { return results, err }` + single append with a switch:
    - `err == nil` → `Applied: true, ModifiedAt: &result.ModifiedAt,
      Reason: ""` (covers both applied and no-op — `result.ModifiedAt` may
      legitimately be `0`).
    - `errors.Is(err, ErrAnimePatchConflict)` → `Applied: false,
      ModifiedAt: &result.ModifiedAt, Reason:
      contracts.AppliedOperationReasonConflict`; append and **continue the
      loop**, do not return.
    - `default` → unchanged: `return results, err` (genuine failure aborts
      the batch, exactly as today).
  - Delete the now-dead `result.Outcome != contracts.AnimePatchOutcomeConflict`
    comparison — a conflict can no longer reach the `err == nil` case, so it
    folds away naturally rather than being "repaired".
  - `&result.ModifiedAt` is safe without an `int64Ptr` helper: `result` is
    declared fresh inside each loop iteration.

- [x] **3.1b** Add the intra-batch conflict guard to the same loop (design
  decision: "a base-less operation after a conflict on the same anime is not
  applied"). Declare `conflicted := map[string]int64{}` before the loop. In
  the `errors.Is(err, ErrAnimePatchConflict)` case, record
  `conflicted[operation.AnimeID] = result.ModifiedAt`. After the decode and
  nil-writer guards but **before** calling `applyPendingPatch`, add:
  if the id is in `conflicted` AND `patch.Base == nil`, append
  `Applied: false, ModifiedAt: &token, Reason: …ReasonConflict` and
  `continue` **without calling the writer**.
  Two properties this must preserve, both covered by 2.7b:
  - The writer is genuinely not called for the blocked operation — that is
    what stops the overwrite; appending the right entry while still writing
    would pass a naive assertion and lose the data anyway.
  - The guard is gated on `patch.Base == nil`, so an operation carrying its
    own base still reaches the writer and can legitimately succeed.
  Why this exists: making a conflict non-fatal removes the accidental
  protection the batch abort provided today. Without this guard, a batch can
  have its first operation for a record correctly rejected and a later
  base-less operation for the same record silently overwrite the value that
  rejection protected.

- [x] **3.2** Update `operationRefsFromAppliedOperations`
  (`internal/api/handlers/sync_handler.go:182-193`) to derive its `outcome`
  string from the new fields instead of only `Applied`: `"applied"` when
  `operation.Applied`; `"conflict"` when
  `operation.Reason == contracts.AppliedOperationReasonConflict`; `"skipped"`
  otherwise. `common.go`, `anime_handler.go`, and `websocket_handler.go`
  remain untouched — they call this same helper and inherit the richer
  outcome for free.

- [x] **3.3** Run `go test ./internal/api/handlers/... -run TestSyncHandler -v`.
  Confirm every test from section 2 now passes, and no other test in the
  package regressed.

- [x] **3.4** Verify the shared-adapter seam is untouched, by construction and
  by measurement: `git diff --quiet -- internal/api/handlers/common.go
  internal/api/handlers/anime_handler.go
  internal/api/handlers/websocket_handler.go
  internal/api/handlers/common_outcome_test.go
  internal/api/handlers/anime_handler_helpers_test.go` must report no
  changes (exit 0, no output). Then run
  `go test ./internal/api/handlers/... -run
  'TestPatchAnimeHandlerOutcomeAdapterKeepsExistingWireShape|TestAdaptAnimePatchWriter|TestPatchConflictCapturePreservesAuthoritativeID'
  -v` and confirm the three named pins
  (`common_outcome_test.go:19-63`, `:69-100`,
  `anime_handler_helpers_test.go:70-84`) still pass byte-identical.

## 4. Mutation & Refactor

- [x] **4.1** Run the MUTATE step, naming the owning package (a bare `./...`
  multiplies the ~45-package suite by the mutant count):

  ```bash
  ditto staged --exclude-prefix frontend/ --threshold 0.80 \
    --test-command "go test -count=1 -json ./internal/api/handlers/"
  ```

  Keep `-json` — without it an uncompiled mutant reports `unknown`, which
  scores as a KILL and hides real gaps. Group any survivors by owning
  behavior (per `mutation-tdd`): strengthen the scenario in 2.1-2.7 that
  should have caught it, never add a test named after a source line or
  mutation operator. Re-run until the threshold is met or a survivor is
  proven equivalent with a written, narrowly-scoped reason.

- [x] **4.2** Refactor pass: remove any temporary diagnostic assertions,
  consolidate duplicated stub/setup code between
  `sync_handler_occ_token_test.go` and the existing `syncHandlerStubs` /
  `enrichedReconcileRequest` helpers, and re-run
  `go test ./internal/api/handlers/...` to confirm the suite is still green
  after refactor (no observable behavior change).

## 5. Documentation

Independent of sections 2-4; touches only `docs/openapi.yaml`. Must land in
the same commit as the code change (repo convention, precedent at
`docs/openapi.yaml:182-187`) — do not ship as a follow-up.

- [x] **5.1** `docs/openapi.yaml`, `AppliedOperation` schema (`:367-387`):
  - Add `modified_at` (`type: integer`, no `nullable`, described as present
    whenever a write outcome was computed — applied, no-op, or conflict —
    including when the value is `0`, and omitted entirely for a skipped
    operation; each outcome's token source per design's Data Flow section).
  - Add `reason` (`type: string`, `enum: [unsupported_operation, conflict]`),
    described as present only when `applied: false`, with the
    permanent-vs-recoverable client guidance from the spec (discard
    `unsupported_operation`; re-base on `modified_at` and retry
    `conflict`), and the "an unrecognised value MUST be surfaced, never
    discarded" rule.
  - Correct the `applied` property's description (`:384-387`): it currently
    says the two causes are indistinguishable — replace with a note that they
    are now distinguished by `reason`.
  - Add a deprecation note on `ReconcileResponse.conflicts` (`:518-521`):
    superseded by the per-operation `reason` + `modified_at`, kept emitting
    `[]` for backward compatibility, removal is a separate announced change.

- [x] **5.1b** `docs/openapi.yaml` — document the intra-batch guard, since it
  is a real behaviour that is not deducible from the field list. State: once
  an operation for an `anime_id` conflicts within a batch, a later operation
  for that same `anime_id` in the same batch that omits `base` is NOT applied
  and is reported `applied: false, reason: "conflict"` with the same winning
  `modified_at`; a later operation that carries `base` is still evaluated
  normally. Add the retry-accounting caveat explicitly: **a blocked operation
  did not fail on its own merits**, so a client with a bounded retry counter
  must not charge it as its own failure. (Design records why this is a
  documented imprecision rather than a new `blocked_by_conflict` value: a new
  value would force handling on every existing client and turn a
  silent-data-loss fix into a visible regression.)

- [x] **5.2** `docs/openapi.yaml:182-187` — correct the 2026-09-03 note that
  claims the conflict-yields-`applied:false` behavior and "one entry per
  pending operation, same order" were "unchanged and already relied upon."
  That was never true: a conflict never reached the `applied_operations`
  append before this change, and an aborted batch wrote no response body at
  all. Replace with a note that SDD-66 is what makes conflict-as-a-per-
  operation-outcome (plus `modified_at` and `reason`) real, and that the
  previous behavior on a conflict was an unreachable HTTP 500 that discarded
  the entire response body.

## 6. Verification & Delivery

- [x] **6.1** Run the full gate and confirm exit 0 on all of:
  `go build ./...`, `go vet ./...`, `go test ./...`,
  `go run ./tools/checkgofilesize`, `bun --cwd="frontend" run build`,
  `bun --cwd="frontend" run render:smoke`, `wails build` (plain — **not**
  `-clean`, which fails with "Access is denied" if a `wails dev` instance
  still holds `build/bin/autoreas-bridge-dev.exe`).

- [x] **6.2** Confirm `internal/api/handlers/common.go`,
  `internal/api/handlers/anime_handler.go`, and
  `internal/api/handlers/websocket_handler.go` show zero diff against the
  pre-change baseline (already checked in 3.4; re-confirm here as part of the
  delivery gate, not just the implementation gate).

- [ ] **6.3** Commit as one work unit (this change stays inside one PR per
  the review workload forecast below): a conventional commit message
  describing the wire-contract fix (token echo + non-fatal conflict), body
  noting the OCC vocabulary and the `docs/openapi.yaml` correction. Include
  in the commit's evidence trail: the focused test command and result from
  3.3, the mutation result from 4.1, and the rollback boundary (single-commit
  `git revert`, valid until Autoreas Mobile ships `base`; the token echo and
  the conflict fix must never be reverted separately, per design's Migration
  section). Run `git commit` with a generous timeout (>= 300000 ms); never
  `--no-verify`.

## Review Workload Forecast

Independent estimate from this task list, by file:

| File | Estimated added/changed lines |
|---|---|
| `internal/api/contracts/contracts.go` | ~14 (type, 2 consts, 2 fields, doc comments) |
| `internal/api/handlers/sync_handler.go` | ~35 (loop restructure ~25, outcome mapping ~10) |
| `internal/api/handlers/sync_handler_test.go` | ~20 (two strengthened assertions blocks) |
| `internal/api/handlers/sync_handler_occ_token_test.go` | ~180-220 (5 new integration tests, table/stub setup) |
| `docs/openapi.yaml` | ~35-45 (two new properties + enum + three prose corrections) |

Plus the intra-batch conflict guard added after this table was first written
(tasks 2.7b, 3.1b, 5.1b):

| File | Estimated added/changed lines |
|---|---|
| `internal/api/handlers/sync_handler.go` | ~10 (map declaration, one record, one guard block) |
| `internal/api/handlers/sync_handler_occ_token_test.go` | ~45-55 (two cases) |
| `docs/openapi.yaml` | ~15 (guard behaviour + retry-accounting caveat) |

**Total estimate: ~355-415 changed lines**, against a 400-line
`review_budget_lines` for `single-pr`. This straddles the budget boundary.

Two things keep it there rather than over:

1. The two guard cases in 2.7b MUST be written as **table-driven cases inside
   one test function**, reusing the stub setup already present in the file —
   not two standalone functions with duplicated scaffolding. This repo has a
   `no-duplication` skill precisely because Go test boilerplate is where
   duplication accumulates.
2. The estimate is a forecast, not a measurement. The **actual** diff is
   measured at verification (`git diff --stat`) before the commit. If the
   measured total exceeds 400, that is surfaced with real numbers for a
   size-exception decision — not guessed at from this table.

**Chained PRs recommended: No.**
**Decision needed before apply: No** — but the measured diff is a hard gate at
verification, and a measured >400 becomes a decision at that point.

### MEASURED RESULT — `size:exception` recorded

`git diff --stat` after apply, all six files including the new test file:

| File | Lines |
|---|---|
| `docs/openapi.yaml` | 80 |
| `internal/api/contracts/contracts.go` | 22 |
| `internal/api/handlers/sync_handler.go` | 27 |
| `internal/api/handlers/sync_handler_helpers_test.go` | 63 |
| `internal/api/handlers/sync_handler_occ_token_test.go` (new) | 258 |
| `internal/api/handlers/sync_handler_test.go` | 12 |
| **Total** | **448 insertions + 14 deletions = 462** |

**462 against a 400 budget — over by 62 lines (15%).** Recorded as
`size:exception` rather than chained, on this reasoning:

- **333 of the 462 lines are test code** (258 + 63 + 12). Production is 49
  lines (`contracts.go` 22 + `sync_handler.go` 27) and documentation is 80.
  The reviewer-burden the 400-line budget exists to bound is concentrated in
  those 129 lines, not in the tests.
- The test volume is **mandated, not incidental**: strict TDD is active, the
  spec has nine scenarios, and every presence/absence assertion must decode to
  raw JSON rather than round-trip a struct. Cutting tests to fit a line budget
  would trade the only evidence this change works for a number.
- **Chaining is not available here.** The conflict-non-fatal fix is a hard
  prerequisite for both `modified_at`-on-conflict and `reason: "conflict"`:
  before it, a conflict never reaches the `AppliedOperation` append at all.
  Splitting would ship an untestable intermediate state — the exact thing
  chaining is supposed to avoid.
- The one compression already applied: the intra-batch guard cases are
  table-driven inside one function, sharing the file's existing stub setup.

This is recorded, not hidden: the overage and its composition are reported to
the user with the final result.

## Verification Results (measured by the orchestrating agent, CLAUDE.md #3)

All measured on the staged change, 2026-09-04. Baseline for every row was
exit 0 before any edit, so these are "still green", not "green".

| Gate | Result |
|---|---|
| `go build ./...` | exit 0 |
| `go vet ./...` | exit 0 |
| `go test ./...` (full suite) | exit 0 |
| `go run ./tools/checkgofilesize` | exit 0 — same 3 pre-existing warnings, **no new file crossed 400** |
| `golangci-lint run ./internal/api/...` | **0 issues** |
| `bun --cwd="frontend" run build` | exit 0 (841ms) |
| `bun --cwd="frontend" run render:smoke` | exit 0 — bundle renders on every checked route |
| `wails build` | exit 0 — `autoreas-bridge.exe` in 17.8s |
| `wails dev` | starts fully: Vite on :5174, bindings generated, app compiled, DevServer on :34115, assets served, watcher active |

**MUTATE (`ditto` v0.10.0)**, scoped to the owning package:

```
ditto staged --exclude-prefix frontend/ --threshold 0.80 \
  --test-command "go test -count=1 -json ./internal/api/handlers/"
```

**Score 1.00 — 5 mutants, 5 killed, 0 survived** (threshold 0.80). One further
mutant never compiled and is excluded from the score entirely rather than
counted as a kill — which is exactly why `-json` is mandatory. The mutants
landed on the new logic: the `patch.Base == nil` guard condition (three
mutants at `:180`), the guard's `continue` (`:182` Loop Break), the
`errors.Is` branch (`:186`), and the reason-derived capture mapping (`:206`).

**Untouched-by-construction check (6.2)**: `git status --short` on
`common.go`, `anime_handler.go`, `websocket_handler.go`,
`common_outcome_test.go` and `anime_handler_helpers_test.go` returns empty.
All five byte-identical, so the three named PATCH pins re-run unmodified.

**Notes carried forward, not silently dropped:**

- `wails build -clean` fails with "Access is denied" while a `wails dev`
  instance holds `build/bin/autoreas-bridge-dev.exe`. Plain `wails build`
  works. The `wails dev` run above reports the same error on *teardown* only,
  for the same reason — startup succeeded completely.
- The editor's `newexpr` analyzer suggests `new(x)` over the local
  `int64Ptr(x)` helper (`sync_handler_occ_token_test.go:251`,
  `sync_handler_helpers_test.go:102`). `golangci-lint` does not flag it, so it
  is an editor-level modernisation hint, not a gate failure. Left as-is.

**REFACTOR step (the R in RED → GREEN → MUTATE → REFACTOR):** the first commit
attempt failed the `golangci-lint` hook job with `gocognit` 17 (> 15) and two
`nestif` findings on `assertAppliedEntry`. Note the hook runs a stricter linter
set than a bare `golangci-lint run ./internal/api/...`, which reported 0 issues
— always trust the hook, not the manual run. Fixed by splitting the helper into
`assertEntryApplied` / `assertEntryReason` / `assertEntryModifiedAt`, each using
an early `return` instead of `else` nesting. Behaviour-preserving: same
assertions, same failure conditions. Re-verified after the refactor —
`gocognit`+`nestif` 0 issues, `gofmt` clean, `go test ./internal/api/...` green,
and **ditto re-run still scores 1.00 (5/5 killed, 0 survived)**, which is what
proves the refactor did not weaken an assertion.
