# Proposal: SDD-66 — OCC token echo on applied operations

## Intent

Mobile cannot arm OCC. `AppliedOperation` carries only `anime_id`/`operation`/`applied`, and the
`bridge_changes` feed hardcodes `modified_at: 0` (`internal/anime/mobile.go:59-64`), so a client has
no cheap way to learn its next `base` token. Worse, the moment mobile *does* send `base`, the first
conflict becomes an error in `AdaptAnimePatchWriter` (`common.go:107-108`), aborts the batch mid-loop
(`sync_handler.go:174-175`) and falls through to HTTP 500 (`sync_handler.go:117`), destroying
`applied_operations`, `bridge_changes` **and** `last_changelog_id` for the whole request. Shipping the
token echo alone would hand mobile a worse failure than today's silent clobbering.

## Scope

### In Scope

- `contracts.AppliedOperation` gains `ModifiedAt *int64` (`json:"modified_at,omitempty"`), from
  `result.ModifiedAt` for applied / no_op / conflict, **omitted** for the skipped branch — never
  zeroed, because `0` is a legitimate token in this codebase.
- A conflict becomes a per-operation outcome: the batch continues and returns 202 with its cursor and
  changes — the behaviour `docs/openapi.yaml:381-387` already documents and that is unreachable today.
- A closed-vocabulary `reason` separating the two `applied: false` causes.
- `docs/openapi.yaml` updated in the same commit (precedent: lines 182-187): the two new fields, plus a
  **correction to the 2026-09-03 note at `:182-187`**, which currently claims the conflict-yields-
  `applied: false` behaviour "is unchanged and was already relied upon". It never held — a conflict
  never reaches the `AppliedOperation` append at all, and an aborted batch writes no response body, so
  its sibling claim of "one entry per pending operation sent and in the same order" was equally
  unreachable. The note must say this change **fixes** that, not that it documents a standing guarantee.

### Out of Scope (follow-ups)

- Mobile sending `base` (their SDD); dead `OCCObserveOnly` flag; restoring
  `docs/sync-occ-mobile-contract.md`; `cap_plus`/`cap_minus` never reaching `isPendingPatchOperation`.
- **`PATCH /api/animes/{id}` reports a conflict as HTTP 500** — see the dedicated section below.
- Deleting `conflicts []any`; threading conflict IDs into batch capture correlations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-sync-contract`: requirement "Sync Reconcile Returns Bridge Changes"
  (`openspec/specs/mobile-sync-contract/spec.md:122-150`) — entries gain `modified_at` and `reason`,
  and a conflict scenario replaces today's unreachable 500.

## Approach

### Where the conflict fix belongs

`applyPendingOperations` (`sync_handler.go:159-180`) intercepts `errors.Is(err, ErrAnimePatchConflict)`
and appends a per-operation entry instead of returning. **`AdaptAnimePatchWriter`,
`pendingOperationErrorResponse` and `anime_handler.go` are not touched**, so the PATCH path is
unchanged by construction rather than by promise. `ErrAnimePatchConflict` is exported from the same
package (`common.go:94`) and `%w`-wrapped, so `errors.Is` unwraps with no new dependency. WebSocket
inherits the fix free through the shared helper.

| Option | Verdict |
|---|---|
| `errors.Is` inside the loop | **CHOSEN.** That function already dispatches on typed errors (`invalidPendingOperationError`, `pendingPatchUnavailableError` — `sync_handler.go:168,171,216-225`), so this is its established idiom, not new error-as-control-flow. `result` is already in hand at line 173. Smallest diff. |
| Two adapter seams | Rejected. Note this option was partly motivated by protecting a PATCH-side 409 that **does not exist**; with that gone it is weaker still, but it fails on independent grounds: it duplicates outcome mapping across both callers, and a wrong seam in `router.go` compiles with no test to catch it. |
| Drop error-wrapping, map per caller | Rejected. Two deliberately *named* guards pin the adapter's error contract — `common_outcome_test.go:80` ("conflict is not downgraded to success") and `anime_handler_helpers_test.go:70-84`, whose conflict-ID-to-capture wiring rides the error path. |

Use `errors.Is`, not `result.Outcome`: the adapter returns a *zero* `AnimePatchResult` on writer
failure (`common.go:102`), so the sentinel is the only reliable discriminator.

**Pins that must stay byte-identical** (verified in source, all pass untouched):

- `internal/api/handlers/common_outcome_test.go:19-63` — conflict → 500 `"patch anime failed"`.
- `internal/api/handlers/common_outcome_test.go:69-100` — conflict → `errors.Is(err, ErrAnimePatchConflict)`.
- `internal/api/handlers/anime_handler_helpers_test.go:70-84` — conflict ID reaches capture correlations.

### Per-branch field matrix — every branch is decided

This table is the contract for `sdd-tasks` and `sdd-apply`. **Do not copy any sketch that ends the
success path with `Applied: true` alone** — the token echo is the primary purpose of this change and
lives on that exact branch.

| Branch | `applied` | `modified_at` | `reason` |
|---|---|---|---|
| applied (`sync_handler.go:177`) | `true` | `result.ModifiedAt` (new token) | **deliberately absent** |
| no_op (same branch) | `true` | `result.ModifiedAt` (unchanged) | **deliberately absent** |
| conflict (new branch) | `false` | `result.ModifiedAt` (winning token) | `conflict` |
| skipped (`sync_handler.go:163`) | `false` | **omitted** | `unsupported_operation` |

The applied/no_op absence is a decision, not an omission of thought: `applied: true` already carries
the meaning, and adding an information-free member to a closed set forces every client to handle it.
It is also symmetric with `modified_at,omitempty`. A JSON-level test pins the absence, not the struct.

Confirmed: the currently-dead clause `err == nil && result.Outcome != AnimePatchOutcomeConflict` at
`sync_handler.go:177` is **removed**, not repaired. A conflict is intercepted before that line and can
no longer reach it, so the comparison folds away naturally and the branch becomes a plain `true`.

### `reason` vocabulary

| `applied` | `reason` | Client action |
|---|---|---|
| `true` | absent | none |
| `false` | `unsupported_operation` | permanent — discard |
| `false` | `conflict` | recoverable — re-base on the echoed `modified_at`, retry |

The set is complete by construction: after this change `applied: false` is produced at exactly two
sites; every other exit is an error. A third cause later gets its own new value announced in
`docs/openapi.yaml`; it must never be folded into an existing one and must never get a catch-all,
because a client that cannot classify a cause as permanent-or-recoverable will guess, and guessing
"permanent" silently deletes a user's edit. The wire contract states that an unrecognised `reason`
MUST be surfaced, never discarded.

### `conflicts []any` — leave in place, declare redundant

Populating it would give the same fact two differently-shaped representations, which is how a client
ends up handling one and ignoring the other. Deleting it is a breaking change for a consumer doing
`response.conflicts.length`. Keep emitting `[]`, mark it deprecated and superseded by the
per-operation `reason` + `modified_at` in `docs/openapi.yaml`, remove it in its own announced change.

### `ConflictID` — do not expose

The client's recovery is fully determined by `reason: "conflict"` + `modified_at`. `ConflictID` is the
primary key of a bridge-internal table reachable only through the admin `/api/conflicts` surface;
putting it on the mobile wire couples mobile to a lifecycle bridge controls. It is already captured
where it belongs on the PATCH path (`anime_handler.go:63-65`). Cheap to add later, expensive to remove.

## Recorded Defect (follow-up): PATCH reports a conflict as HTTP 500

**Not fixed here. Recommendation: separate change.**

`writePatchAnimeError` (`anime_handler.go:130-136`) special-cases only not-found → 404; a conflict
falls through to 500 `"patch anime failed"` via `applyAnimeRequestPatch:111-118`. Both surfaces
therefore mis-report a conflict as a server fault. Three facts make it worth its own change rather
than a rider on this one:

- **Asymmetry.** `patchCaptureErrorCode:121-127` *does* record `"patch_conflict"`, so the bridge's own
  Activity view knows it was a conflict while the client is told "internal server error".
- **Spec contradiction, and 409 is not obviously the answer.** `docs/openapi.yaml:802-810` states a
  base mismatch "never blocks the write -- both values are kept and a conflict is recorded for manual
  resolution", and the endpoint documents 200/400/401/404/500 with no 409 (verified). If that
  description is the intended semantic, the correct fix may be a 200 carrying a conflict indicator,
  **not** a 409. That is an unresolved design question; folding it in would stall a change that is
  otherwise fully decided.
- **No live victim.** Mobile has no PATCH path, and `AppliedOperation` appears nowhere in
  `frontend/src` or `frontend/wailsjs` (exploration §12). The reconcile 500, by contrast, has a
  *scheduled* victim the moment mobile ships `base`.

Cost also matters: it means rewriting a deliberately named guard (`common_outcome_test.go:34-41`,
"conflict is not reported as success"), adding a response to `openapi.yaml`, and a spec delta for the
PATCH capability — plausibly 80-150 lines on top of this change's estimate, which would breach the
400-line budget under `single-pr`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/api/contracts/contracts.go:284-289` | Modified | Two optional fields on `AppliedOperation` |
| `internal/api/handlers/sync_handler.go:159-180` | Modified | Non-fatal conflict branch; both fields per the matrix; dead clause removed |
| `internal/api/handlers/common.go` | Unchanged | Deliberately — the PATCH seam stays as-is |
| `internal/api/handlers/anime_handler.go` | Unchanged | Deliberately — its 500 defect is a follow-up |
| `internal/api/handlers/websocket_handler.go` | Unchanged | Fire-and-forget; new fields ride along in capture data |
| `internal/api/handlers/sync_handler_occ_token_test.go` | New | `sync_handler_test.go` is at 402 lines (warn at 400) |
| `docs/openapi.yaml:182-187` | Modified | Correct the false "unchanged and already relied upon" claim |
| `docs/openapi.yaml:367-387` | Modified | Additive fields, `reason` enum, `conflicts` deprecation |

## Review Workload

**Estimated 250-330 changed lines (additions + deletions) — under the 400 budget, Medium risk.**
Roughly 55-60 production, 150-200 test (strict TDD: four branches plus a batch-continues-past-conflict
integration case), 40-50 docs. Tripwires that would push it over and force an orchestrator decision:
folding in the PATCH 500 fix, adopting the two-seam option, or threading capture enrichment into the
batch conflict path.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The applied-branch token echo is dropped during apply | Med | The per-branch matrix is the task contract; a success-path assertion on `modified_at` is a success criterion |
| Touching the shared adapter breaks a named PATCH guard | Low | Chosen option leaves `common.go` and `anime_handler.go` unchanged; three named pins re-run as-is |
| `modified_at: 0` read as "no token" by a client | Med | Pointer + `omitempty`; skipped branch omits the key entirely; documented in `openapi.yaml` |
| Mobile treats `reason: "conflict"` as permanent and drops the edit | Med | Closed vocabulary + explicit permanent/recoverable semantics in `openapi.yaml`; announced to the consumer |
| An unknown future `reason` is mis-classified | Low | Contract mandates surfacing, never discarding, unrecognised values |
| WS reconcile clients never receive the token | Low | Known and accepted (exploration §4); communicate that HTTP POST is the only OCC-capable transport |

## Rollback Plan

Single-commit `git revert`, restoring the three-field `AppliedOperation` and the abort-on-conflict
loop. Two properties make this safe:

- **The change is observable but inert on arrival.** Mobile does not send `base`, so `command.Base` is
  nil, the OCC comparison short-circuits (`gateway.go:153`, `:180`), and no conflict can be produced
  through the mobile path. Only the applied/no_op token echo is live at first.
- **The rollback window is "before mobile ships `base`".** After they arm OCC, a revert returns them to
  500-on-conflict — losing the whole response body.

Do not revert the two halves separately: reverting the conflict fix while keeping the token echo ships
exactly the trap this change exists to remove. The `openapi.yaml:182-187` correction reverts with it,
which is correct — the claim becomes false again precisely when the behaviour does.

## Dependencies

None blocking. Coordination only: the Autoreas Mobile team consumes `modified_at` + `reason`, and their
`base`-sending work lands after this.

## Success Criteria

- [ ] Applied and no_op operations return a non-zero `modified_at`; a conflict returns the bridge's
      winning token.
- [ ] A skipped operation omits `modified_at` from the JSON entirely (asserted at the JSON level, not
      on the struct).
- [ ] A batch containing a conflict returns **202** with its `last_changelog_id`, `bridge_changes`, and
      one entry per submitted operation in submission order — never 500.
- [ ] `reason` is `unsupported_operation` for a skipped operation, `conflict` for a conflict, and
      absent when `applied: true`.
- [ ] The three named PATCH-path pins pass unmodified, and `common.go` / `anime_handler.go` show no diff.
- [ ] `docs/openapi.yaml` documents both fields and the `reason` enum, marks `conflicts` deprecated, and
      no longer claims the conflict behaviour was a pre-existing guarantee.
- [ ] `go test ./...`, `go vet ./...`, `go run ./tools/checkgofilesize` stay at exit 0.
