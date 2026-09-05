# Exploration — SDD-66: OCC token echo on applied operations

Date: 2026-09-04
Artifact store: `openspec` (resolved by `gentle-ai sdd-status --json`)
Status: complete

## 1. Why this change exists

SDD-30 built optimistic concurrency control (OCC) for anime writes. A bridge-owned
version token `ModifiedAt` is returned to clients as `modified_at`; the client echoes
it back as `AnimePatch.Base` on its next write; the bridge compares them and records a
conflict on divergence.

The entire comparison is one branch, present twice — `internal/anime/store/gateway.go:153`
(`updateOnce`) and `:180` (`updateRawOnce`):

```go
if command.Base != nil && *command.Base != record.ModifiedAt {
    return g.recordConflict(ctx, record, desired)
}
return g.persist(...)
```

Exact `int64` equality. When `Base` is nil the condition short-circuits on its first
operand and goes straight to `persist`.

Autoreas Mobile has never sent `base`. Confirmed by the mobile team from their own
source (`buildReconcileRequestBody` emits exactly `anime_id`, `operation`, `payload`,
`created_at`) and from a captured production request (`request_id`
`c0dda256-23d9-43e4-8416-ce8943da5e3b`, route `/api/sync/reconcile`, HTTP 202):

```json
"applied_operations":[{"anime_id":"Gmi386XNGisZWL3F","operation":"update","applied":true}]
```

So SDD-30's conflict subsystem has no live consumer on the mobile path it was built
for, and the failure it exists to prevent — a stale mobile write silently clobbering a
newer desktop value — is live in production.

## 2. Why mobile cannot simply start sending `base`

After a write, mobile has no cheap way to learn its new token:

- `internal/anime/mobile.go:59-64` — `MobileAnimeFromSnapshotForSync` hardcodes
  `mobileAnimeFromDomain(value, 0)`. Every `bridge_changes` snapshot carries
  `modified_at: 0` by design; its doc comment states that feed is explicitly not a
  token source.
- `contracts.AppliedOperation` (`internal/api/contracts/contracts.go:285-289`) returns
  only `anime_id`, `operation`, `applied`.
- The only live sources are `ListMobileAnimes` (whole catalogue) and `GetMobileAnime`,
  neither part of the reconcile cycle.

With exact `!=`, the **second** write to the same anime would carry a stale token and
become a conflict. Editing the same anime repeatedly (watch ep 5, then 6, then 7) is the
most common mobile interaction. The mobile team measured 135 of 143 catalogue records
currently at `modified_at: 0`, which is the legitimate "never written through the OCC
path" value — it self-arms per row on the first write.

## 3. Verification of every claim in the problem statement

All line references checked against live code. No drift found.

| Claim | Verified |
| --- | --- |
| `gateway.go:153` / `:180` — exact `!=`, nil-Base short-circuits | yes |
| no-op `bytes.Equal` branch at `gateway.go:150-151` / `:177-178` runs BEFORE the base check | yes |
| `sync_handler.go:173-177` obtains `result`, discards `result.ModifiedAt` at line 177 | yes |
| `common.go:108` already uses `result.ModifiedAt` in the conflict error string | yes |
| `gateway_write_helpers.go:20-45` `persist` computes `intended` as `max(now_ms, baseToken+1)`, returns it | yes |
| `gateway_write_helpers.go:48-62` `recordConflict` returns `ModifiedAt: current.ModifiedAt` | yes |
| `mobile.go:59-64` hardcodes 0, doc comment calls 0 a legitimate base value | yes |
| `contracts.AppliedOperation` has exactly three fields | yes |

## 4. The WebSocket path needs no wire work

`internal/api/handlers/websocket_handler.go:20-24` carries an explicit doc comment:
**"WebSocket reconcile is fire-and-forget (no ack frame reaches the client)"**.

`applyReconcileMessage` (`:173-192`) and `rejectedWSOutcome` (`:196-203`) feed
`AppliedOperation` only into `operationRefsFromAppliedOperations` →
`requestcapture.Correlations`, i.e. internal capture bookkeeping. No outbound WS message
carries `AppliedOperation`. `internal/api/websocket_test.go` confirms this empirically:
its reconcile-over-WS tests assert on the finalized snapshot and on capture records,
never on an applied-operations response, because none is sent.

Both transports funnel through the same `applyPendingOperations` helper, so adding a
field to `contracts.AppliedOperation` flows into WS's internal correlation data at zero
cost. **Decision: do not special-case WS to strip the new field; let it ride along
unused.** No WS-specific work is in scope.

Consequence to communicate to mobile: if they ever reconcile over WebSocket instead of
HTTP POST, they will not receive the token and OCC will not work for them.

## 5. A conflict today returns HTTP 500 and destroys the whole response

Found after the initial investigation. This is the finding that expands the change.

Chain:

1. `gateway.go:153` → `recordConflict` returns `Outcome: AnimePatchOutcomeConflict`.
2. `internal/api/handlers/common.go:104-111` — `AdaptAnimePatchWriter` converts that
   outcome into an **error**:
   `case contracts.AnimePatchOutcomeConflict: return result, fmt.Errorf("%w: ...", ErrAnimePatchConflict)`.
3. `internal/api/handlers/sync_handler.go:173-176` — `applyPendingOperations` does
   `if err != nil { return results, err }`, aborting the batch mid-loop with partial
   results.
4. `internal/api/handlers/sync_handler.go:110-118` — `pendingOperationErrorResponse`
   matches neither `invalidPendingOperationError` nor `pendingPatchUnavailableError`, so
   it falls through to `http.StatusInternalServerError, "apply pending operation failed"`.
5. The handler returns without writing `ReconcileResponse`. The client loses
   `applied_operations`, `bridge_changes` **and** `last_changelog_id`.

Three consequences:

- **Dead code.** `sync_handler.go:177` reads
  `Applied: err == nil && result.Outcome != contracts.AnimePatchOutcomeConflict`. That
  line executes only when `err == nil`, and a conflict always carries a non-nil error,
  so the `!= Conflict` comparison can never be false.
- **A live false claim, not stale drift.** `docs/openapi.yaml:381-387` documents
  `applied: false` as having "exactly two causes": unsupported operation type, or "the
  write lost an optimistic-concurrency check and resolved as a conflict". The second is
  unreachable. Worse, the companion passage at `:182-187` is dated **2026-09-03, on this
  very branch**, and asserts the behaviour was *"unchanged and was already relied upon;
  it had simply never been written down"*. That guarantee never held — a conflict never
  reaches the `AppliedOperation` append at all. This is a recently-written false claim,
  not old drift, and its wording must be corrected by this change rather than merely
  extended.
- **No coverage.** `grep Conflict internal/api/handlers/sync_handler_test.go` returns
  nothing.

The batch is also not all-or-nothing: operations before the conflict already persisted
one by one (there is no transaction around the loop), then the request 500s. The mobile
team independently measured this prefix behaviour on device.

**This is latent only because mobile never sends `base`.** SDD-66 exists to let them arm
OCC; the moment they do, the first conflict 500s and loses the response. Shipping the
token echo alone would hand mobile a worse failure than the one they have.

## 6. Consumer requirements (accepted, from the sole consumer)

**REQ-1 — a conflict entry must also carry the bridge's current `modified_at`.**
On a conflict the client's token is stale by definition. With only `applied: false` they
must either retry with the same stale base (conflicts forever) or refetch all of
`/api/animes` (143 records to re-base one row, plus a race window during which another
writer can move it again). The value is already in hand and discarded:
`recordConflict` returns `ModifiedAt: current.ModifiedAt`.

**REQ-2 — the two causes of `applied: false` must be distinguishable by a
closed-vocabulary reason field.** Today only one cause is reachable (unsupported
operation type) and the client treats it as permanent, discarding the operation. After
this change there will be two with opposite reactions: unsupported is permanent and
discarded; conflict is recoverable and must be re-based and retried. A bare
`applied: false` forces a guess, and guessing "permanent" on a conflict silently loses
the user's edit. The causes are structurally distinguishable, not inferred: the
`isPendingPatchOperation` false branch (`sync_handler.go:162-165`, which never calls the
writer) versus the conflict path.

## 7. `modified_at` semantics per outcome

| Outcome | Source | Value |
| --- | --- | --- |
| applied | `persist` | new strictly-increasing `intended` token |
| no_op | `updateOnce` / `updateRawOnce` `bytes.Equal` branch | `record.ModifiedAt`, unchanged |
| conflict | `recordConflict` | `current.ModifiedAt`, the winning token |
| skipped / unsupported | no writer call happens at all | **omitted** |

For the skipped branch, three options were compared:

- **Omit the field** (`*int64` + `json:"modified_at,omitempty"`) — RECOMMENDED. Honestly
  signals "not computed". No extra I/O.
- **Emit `0`** — rejected. `mobile.go:14-17` establishes 0 as a legitimate real token in
  this codebase, not a sentinel, so `0` would be actively misleading.
- **Extra snapshot lookup** — rejected. Adds I/O to a path deliberately designed never to
  touch the writer, and raises the question of what to do when that lookup fails.

The skipped branch is not a rare edge case: the only reconcile E2E test
(`internal/api/sync_e2e_endpoints_test.go:50`) sends `cap_plus` / `cap_minus`, and
`isPendingPatchOperation` (`sync_handler.go:252-259`) recognises only `update` / `patch`,
so those operations land in the skipped branch on every run today.

## 8. Wire compatibility

`docs/openapi.yaml:367-382` declares `AppliedOperation` with
`required: [anime_id, operation, applied]`. Adding an optional field is additive and
non-breaking for existing consumers.

Repo convention (`docs/openapi.yaml:182-187`, a 2026-09-03 precedent for this very
endpoint) requires announcing every wire-adjacent change in `docs/openapi.yaml`, even a
non-breaking clarification. **This change must update `docs/openapi.yaml` in the same
commit.**

## 9. Existing test coverage

CodeGraph reported "no covering tests" for `AppliedOperation`; that is a static-edge
artifact. Real tests exist in `internal/api/handlers/sync_handler_test.go`:

- `TestSyncHandlerAppliesPendingUpdateOperationsBeforeReturning` (248-300) — its
  `ApplyPendingPatch` stub already returns `ModifiedAt: 1000` (line 263) but the test
  never asserts on it (296-299 check only `AnimeID` / `Operation` / `Applied`).
- `TestSyncHandlerIgnoresNonUpdatePendingOperations` (359-402) — exercises the skipped
  branch (`delete`, writer never called). Natural home for a regression test proving the
  skipped branch **omits** rather than zeroes `modified_at`.
- `TestSyncHandlerReturnsAccepted` (42-83) — empty-reconcile case, unaffected.

`internal/api/handlers/sync_handler_test.go` is already 402 raw lines. The repo warns at
400 and hard-fails above 500 effective lines (`go run ./tools/checkgofilesize`). New
tests belong in a separate file (e.g. `sync_handler_occ_token_test.go`), matching the
existing `sync_handler_helpers_test.go` pattern.

## 10. The `conflicts` array is dead scaffolding

`contracts.go:297` declares `Conflicts []any` with tag `json:"conflicts"`.
`sync_handler.go:65` hardcodes `Conflicts: []any{}`. Nothing ever populates it, and
`docs/openapi.yaml` types it as an untyped object array. It is a third piece of SDD-30
scaffolding built and never wired, alongside the unread `OCCObserveOnly` flag and the
deleted contract doc. Whether the per-operation reason makes it redundant is a design
decision for the next phase.

## 10b. The single-anime PATCH surface has the same defect

Found while verifying the shared-adapter constraint. `AdaptAnimePatchWriter` is used by
both the batch reconcile path and `PATCH /api/animes/{id}`, and it was assumed the PATCH
path answered a conflict with 409. It does not.

`internal/api/handlers/anime_handler.go:130-136`:

```go
func writePatchAnimeError(w http.ResponseWriter, err error, isNotFound func(error) bool, fallback string) {
	if isAnimeNotFound(err, isNotFound) {
		writeJSONError(w, http.StatusNotFound, "anime not found")
		return
	}
	writeJSONError(w, http.StatusInternalServerError, fallback)
}
```

Called from `applyAnimeRequestPatch` (`:111-118`) with fallback `"patch anime failed"`.
The only special case is not-found → 404; a conflict falls through to **HTTP 500**.
`grep -n "409\|StatusConflict" internal/api/handlers/anime_handler.go` returns nothing.

Asymmetry worth recording: `patchCaptureErrorCode` (`:121-127`) correctly records
`"patch_conflict"` in the capture row, so the bridge's own Activity view knows it was a
conflict while the client is told "internal server error".

So a conflict — a legitimate, expected, semantic outcome — is reported as a server fault
on **both** HTTP surfaces. The reconcile side is in scope for this change; the PATCH side
is recorded as a follow-up below.

PATCH's 500 is not an oversight — it is **deliberately test-pinned**, twice:

- `internal/api/handlers/common_outcome_test.go:34-41`, inside
  `TestPatchAnimeHandlerOutcomeAdapterKeepsExistingWireShape`, case named
  **"conflict is not reported as success"**:
  `wantStatus: http.StatusInternalServerError`, `wantBody: "error":"patch anime failed"`.
- `internal/api/handlers/common_outcome_test.go:80`, case
  **"conflict is not downgraded to success"**, asserting `AdaptAnimePatchWriter` returns
  `ErrAnimePatchConflict` at the adapter level.
- `internal/api/handlers/anime_handler_helpers_test.go:70-81` —
  `TestPatchConflictCapturePreservesAuthoritativeID` sets
  `stubs.patchErr = ErrAnimePatchConflict` and asserts the conflict ID reaches capture
  correlations, so the conflict-ID-to-capture wiring depends on the error path.

**But the PATCH spec contradicts its own pin.** `docs/openapi.yaml:804-810`, describing
the `base` field: *"A mismatch never blocks the write -- both values are kept and a
conflict is recorded for manual resolution."* The PATCH endpoint documents only
200/400/401/404/500 — no 409 exists in the spec at all. So the spec says a mismatch never
blocks, while a named test pins a blocking 500. Both cannot be right.

The adapter's contract is deliberately pinned; the HTTP status mapping downstream is
what disagrees with the spec. Resolving that disagreement is a follow-up (§11), not part
of this change.

## 11. Out of scope (follow-ups, not this change)

- Making mobile send `base` — the mobile team's own SDD.
- **The PATCH spec-vs-test contradiction (§10b).** `docs/openapi.yaml:804-810` says a base
  mismatch "never blocks the write", while `common_outcome_test.go:34-41` pins a blocking
  HTTP 500. One of the two is wrong and someone must decide which. Deliberately excluded
  here: it is a wire-behaviour change on an endpoint mobile does not call (they have no
  PATCH path at all), it would need its own openapi entry, and folding it in would grow
  the diff against a 400-line budget. Recording it so it is not lost.
- The dead `OCCObserveOnly` flag (`write_service.go:60`, set true at `app.go:313` and
  `app_runtime_services.go:252`, read nowhere).
- Restoring the deleted `docs/sync-occ-mobile-contract.md`.
- `cap_plus` / `cap_minus` never reaching `isPendingPatchOperation` — pre-existing
  behaviour, unrelated to this change, but worth a separate look.

## 12. Measured baseline before any edit

| Gate | Result |
| --- | --- |
| `go build ./...` | exit 0 |
| `go vet ./...` | exit 0 |
| `go test ./...` | exit 0 |
| `go run ./tools/checkgofilesize` | exit 0, 3 pre-existing warnings, none in touched files |
| `bun --cwd=frontend run build` | exit 0 |
| `bun --cwd=frontend run render:smoke` | exit 0 |

`contracts.AppliedOperation` appears nowhere in `frontend/src` or `frontend/wailsjs`:
this is a Go-only change with no Wails binding impact.

## 13. Recommendation

Add an optional `modified_at` to `contracts.AppliedOperation`, populated from
`result.ModifiedAt` for applied / no_op / conflict and omitted for skipped; make a
conflict report per-operation instead of aborting the batch with a 500; add a
closed-vocabulary reason distinguishing the two `applied: false` causes; update
`docs/openapi.yaml`.

Next phase: `sdd-propose`.
