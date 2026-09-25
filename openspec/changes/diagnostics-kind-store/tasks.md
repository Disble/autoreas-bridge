# Tasks: Diagnostics Kind Store

Change: `diagnostics-kind-store`. Inputs: `proposal.md`, `design.md`,
`specs/device-telemetry-kinds/spec.md`, and the feature record `odd/tasks/diagnostics-kind-store.md`, which
carries each slice's contract and its verification evidence.

> `openspec/` is historical evidence in this repository, not an active contract. The code and
> `docs/openapi.yaml` are the execution contract.
>
> **This change is not verified complete, and there is deliberately no `verify-report.md`.** Slices 1, 2–3,
> 4a, the `episode_action` kind and the refusal vocabulary have shipped; **slice 4b was still open at the
> time of writing**, so the feature could not be reported as verified. Writing a verify report then would
> have implied closure that did not exist.

**Delivery model for this repo**: sequential work-unit commits, each passing the full pre-commit gate on
its own (`lefthook`, never `--no-verify`). Development stays on `feat/diagnostics-kind-store` off `dev`;
`main` is deployments only. Tests follow RED → GREEN → MUTATE → REFACTOR, and a test must fail when its
guard is removed.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,850 (slice 1) · ~760 (slices 2–3) · ~1,370 (episode_action) · ~270 (refusals) · ~1,300 (slice 4a) · slice 4b pending |
| 400-line budget risk | High per commit at the aggregate level — which is why the work was cut into slices that each ship and gate alone, not because any slice was left ungated |
| Chained PRs recommended | Yes — the slice boundary is the review unit |
| Delivery strategy | auto-chain |
| Suggested split | Slice 1 → slices 2–3 → `episode_action` → refusal vocabulary → slice 4a → slice 4b |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| Unit | Commit | Focused test command | Rollback boundary |
|---|---|---|---|
| 1 — discriminated store, registry, `cycle_report` | `5bbcbf3` | `go test -count=1 -json ./internal/observability/telemetry/` | `git revert`; the table is additive and nothing reads it yet |
| 2–3 — kind dispatch on the same path + composition root | `2f90928` | `go test -count=1 -json ./internal/api/handlers/ ./internal/observability/telemetry/ ./internal/desktop/` | `git revert`; the route reverts to the single-shape path |
| WU2 — `episode_action` kind | `5bb4fdc` | `go test -count=1 -json ./internal/observability/telemetry/` | `git revert`; one registry entry, no schema change |
| Refusal vocabulary | `e1b8025` | `go test -count=1 -json ./internal/api/handlers/` | `git revert`; the status codes alone remain, as before |
| 4a — the read side | `125f304` | `go test -count=1 -json ./internal/desktop/ ./internal/observability/telemetry/` | `git revert`; slice 4b deliberately left the legacy table registered so this one is independently revertible |
| 4b — retire the legacy table | *(pending at the time of writing)* | not yet run | not yet applicable |

---

## Delivered

### Slice 1 — discriminated store, kind registry, `cycle_report` as the first kind (commit `5bbcbf3`)

16 files, 1850 insertions, 23 deletions.

- [x] 1.1 RED: an unknown `kind` is rejected naming it; a registered kind dispatches to its own validator;
      the `cycle_report` kind is reachable by name.
- [x] 1.2 RED: legacy compatibility — a body with no `kind` decodes as `cycle_report` with byte-identical
      behaviour, asserted against the existing handler tests. An explicit `kind: "cycle_report"` alias
      validates identically.
- [x] 1.3 RED: `UNIQUE(kind, event_id)` — the same key string under two different kinds stores two rows;
      the same `(kind, key)` twice stores one row and acks `204`.
- [x] 1.4 GREEN: `internal/observability/telemetry` — envelope, kind registry, per-kind retention budget.
- [x] 1.5 GREEN: table DDL through `EnsureTableSchema` with **no** `Migrate` hook and **no** `ColumnAdds`.
- [x] 1.6 GREEN: store write path — idempotent insert by `(kind, event_id)`, write budget, shed outcome,
      per-kind prune (on the first successful write of the process and every `pruneEvery` successes after).
- [x] 1.7 GREEN: the `cycle_report` kind registering the existing `syncdiag` validator unchanged.
- [x] 1.8 RED: the declared `TableSchema` has a nil `Migrate` and an empty `ColumnAdds` — asserted, because
      the lifecycle rule needs a machine owner.
- [x] 1.9 RED: `payload_json` is re-serialized from validated values, never copied from the client's raw
      bytes, and asserted against a **literal golden** rather than a re-marshal of the same struct.
- [x] 1.10 GREEN: `payload_json` snake_case tag contract on `syncdiag.Record` / `syncdiag.PreviousCycle`,
      with `json:"-"` on `DeviceID`, `ReportedAtMS` and `Degraded`.
- [x] 1.11 GREEN: `Insert` refuses a kind with no declared retention cap, before any database work.
- [x] 1.12 The three speculative `syncdiag` indexes are not carried over; the new store indexes only what a
      query uses.
- [x] 1.13 GATE: `go test ./...` clean; both lint profiles `0 issues.`; `checkgofilesize` clean;
      `ditto staged` on `telemetry`: 42 mutants, 41 killed, score 0.98.
- [x] 1.14 Review finding, fixed before ship: the stored payload's first version used Go field names and
      fake zero values duplicating column authority. Verified by printing the real bytes from a decode.
- [x] 1.15 Review finding, fixed before ship: the test that pinned the payload was circular and was
      replaced, with proof that the new one fails when a single tag is removed.
- [x] 1.16 Review finding, fixed before ship: the table could grow without bound for a kind with no
      declared cap; `Insert` now refuses such a kind with `ErrUndeclaredKind`.

### Slices 2–3 — the endpoint is kind-discriminated, and the store is real at the composition root (commit `2f90928`)

- [x] 2.1 RED: an absent `kind` still decodes and stores as `cycle_report`, asserted through the handler.
- [x] 2.2 RED: an explicit `kind: null` is rejected with `400` naming `kind`, and stores nothing.
- [x] 2.3 RED: a non-string `kind` is rejected with `400` naming `kind`.
- [x] 2.4 RED: an unknown but well-formed `kind` is rejected with `400` naming `kind`, and stores nothing.
- [x] 2.5 RED: a registered kind dispatches to its own validator and stores under its own name.
- [x] 2.6 RED: `ErrUndeclaredKind` maps to `500`, not `503` — the distinction that keeps a wiring bug from
      becoming a retry loop.
- [x] 2.7 RED: `ErrWriteBudget` still maps to `503` with `Retry-After: 5`, and never to `204`.
- [x] 2.8 RED: `Stored` and `Duplicate` both ack `204`; an oversize body still reports `413` before any
      decode; `telemetry.DefaultRegistry()` contains `cycle_report`.
- [x] 2.9 GREEN: the `json.RawMessage` discriminator probe — absent means the frozen default, an explicit
      `null` is refused, a non-string is refused, an unregistered name is refused.
- [x] 2.10 GREEN: `telemetry.DefaultRegistry()` as the single vocabulary declaration point; the store built
      from the same registry the handler dispatches on.
- [x] 2.11 GREEN: the `IngestTelemetryEventFunc` seam carrying `telemetry.Event`; the device id still comes
      only from the authenticated token and the receipt clock only from the bridge.
- [x] 2.12 GATE: `go test ./...` clean; both lint profiles `0 issues.`; `checkgofilesize` passed;
      `ditto staged` over the three packages: 7 mutants, 7 killed, score 1.00.
- [x] 2.13 Review finding, fixed: a body that is literally `null` was answered `400` blaming a
      `cycle_report` field the body never declared. Probed empirically before fixing; a nil map is now
      refused as an unreadable body, while `{}` deliberately keeps the which-field `400`.

### `episode_action` kind, end to end (commit `5bb4fdc`)

- [x] 3.1 Wire field names aligned with mobile before writing: `episode_*` (not `chapter_*`),
      `observation_id` (not `cycle_id`), `observed_at_ms` (not `at`), `outcome` gated as one cross-field
      rule against `phase`, `duration_ms` with one direction.
- [x] 3.2 RED: each closed vocabulary, the `phase` × `outcome` cross-field rejection, and the `duration_ms`
      direction rule.
- [x] 3.3 RED: `cause` gated by a distinctly named set whose members match `previous_cycle.error_cause`.
- [x] 3.4 GREEN: the kind registered in `DefaultRegistry()` and nowhere else — no schema change, no
      per-kind column, no migration.
- [x] 3.5 GREEN: the stored payload is the fixed seven-key shape with explicit nulls, asserted against a
      literal, and repeating neither `kind` nor `observation_id` nor `observed_at_ms`.
- [x] 3.6 DOCS: `docs/openapi.yaml` gains the variant behind a `oneOf` with
      `discriminator.propertyName: kind`, plus the dated 2026-09-25 additive consumer-impact entry.
- [x] 3.7 The moved `cycle_report` request schema is byte-identical: 178 lines each against `HEAD` with
      indentation stripped, empty diff.
- [x] 3.8 GATE: `go test ./...` clean; `checkopenapi` passed; `checkgofilesize` passed; both lint profiles
      `0 issues.`; `ditto staged` on `telemetry`: 50 mutants, 41 killed, score 0.82, with all nine
      survivors analysed — six equivalent error-path returns, one defensive nil guard unreachable behind
      an earlier rejection, two retention-literal mutants left alive because killing them would mean
      pinning a production constant. Effective score 1.00. No threshold weakened, no survivor suppressed.

### The refusal vocabulary grows (commit `e1b8025`)

- [x] 4.1 GREEN: every refusal this operation emits carries a `code` from the closed
      `SyncDiagnosticsRefusalCode` vocabulary; `kind_not_served` is the only recoverable member.
- [x] 4.2 GREEN: one `writeRefusal` call site for every refusal, so a class cannot be added at a call site
      that forgets its code. `field` is omitted rather than empty when no field was named.
- [x] 4.3 A per-case status and a per-case boolean were rejected in the record: a boolean expresses one
      fact, so a second class needs a second key; a status per class spends the status space on something
      that belongs in the body.
- [x] 4.4 DOCS: `docs/openapi.yaml` declares the vocabulary, makes the two `400` branches mutually
      exclusive with `additionalProperties: false` and literal key sets, and corrects the consumer-impact
      entry, which had claimed no response changed.
- [x] 4.5 The test asserting the codes uses literal strings on purpose: asserting against the constant
      moves both sides together and passes under any change to it, which was proved by hand before the
      literal version replaced it.
- [x] 4.6 GATE: `go test ./...` clean; `checkopenapi` passed; `checkgofilesize` passed; both lint profiles
      `0 issues.`; `ditto` found no mutants because this change adds no mutable operator — an absence of
      signal, not a coverage claim.

### Slice 4a — the read side moves with the write side (commit `125f304`)

- [x] 5.1 RED: a cycle report stored through the telemetry store is read back through the new reader and
      mapped into the desktop DTO with every field intact, including the three that moved into
      `previous_cycle`, and an explicitly null `previous_cycle` mapping to absent fields.
- [x] 5.2 RED: the reader is kind-scoped — an `episode_action` row never appears in a cycle-report read.
- [x] 5.3 RED: a device predicate restricts the page; an empty one does not; the limit is clamped in SQL,
      including the `limit 1` boundary the first version missed.
- [x] 5.4 RED: a missing table reports unavailable rather than erroring; a row whose payload does not
      unmarshal degrades instead of panicking; newest-first ordering.
- [x] 5.5 GREEN: `telemetry/reader.go` (envelope read) and `telemetry/cycle_report_read.go` (the kind's own
      projection), keeping the generic reader kind-agnostic.
- [x] 5.6 GREEN: the desktop read surfaces repointed, keeping the capability name and the DTO field set
      identical, so nothing user-visible changes beyond the data becoming live again.
- [x] 5.7 GREEN: the catalog, the MCP manifest and the DTO doc comment name the store that now backs
      `list_device_sync_diagnostics` — names and reasons, not logic.
- [x] 5.8 `device_sync_diagnostics` deliberately NOT retired in this slice: it stays registered and its rows
      stay untouched and unread, so this slice is independently reviewable and revertible. `syncdiag`'s
      schema and reader are not deleted here either; slice 4b owns that.
- [x] 5.9 GATE: 2904 tests executed, 0 failed, 3 skipped; `checkgofilesize` passed; both lint profiles
      `0 issues.`; `ditto` on `telemetry`: 39 mutants, 36 killed, score 0.92, with one non-equivalent
      survivor found by the report (`limit <= 0` → `limit <= 1`) and closed with a `limit 1` boundary case.

---

## Delivered after this file was first written

### Slice 4b — retire the legacy table (commit `fc206a0`)

The end state is one store, and it is reached. Every item below is done and gated.

- [x] Removed `syncdiag.SchemaTables()` from `internal/sync/sqlite_bootstrap.go`, so
      `device_sync_diagnostics` is never created again. Existing installs keep the table and its rows:
      nothing drops them, and nothing reads them.
- [x] Deleted `syncdiag/{schema,schema_test,reader,reader_test,store,store_test}.go` with it, and the
      write-path declarations only `InsertReport` consumed. Each deletion was confirmed by reporting the
      callers found: `NewStore`, `InsertReport`, `NewReader`, `Report`, `ReportQuery` and `Store` all had
      zero production callers, and `SchemaTables` had exactly one, the bootstrap.
- [x] **RED: the no-lifecycle-data-migration guard**, in two halves because either alone can be satisfied
      by the wrong thing. One asserts the retired table is absent after bootstrap **and** that the
      replacement store exists, so it cannot pass by bootstrap doing nothing. The other builds a real
      install — the shipped 21-column shape, its four indexes, and rows varying NULL, empty string and text
      — snapshots its `sqlite_master` row, index list, column definitions and every row with its rowid,
      bootstraps over it, and compares. Rows alone would not be enough: a hook that drops and recreates the
      table with the same rows keeps those bytes and still replaced the store. A dropped table is a named
      failure, never a comparison of zero bytes.
- [x] GATE: 2879 tests executed, 0 failed, 3 skipped; both lint profiles `0 issues.`; `checkgofilesize`
      passed. Proof the guard can fail was done by hand, because a deletion and a comment produce no
      mutants: re-adding a descriptor for the retired table with a reshaping `Migrate` hook failed both
      halves, and restoring it left the tree byte-identical.
- [x] Resolved the transient constant duplication this file recorded as open. Exactly one owner remains:
      `telemetry` owns `WriteBudget`, `RetryAfterSecs`, `MaxBodyBytes`, `IngestOutcome` and `ErrWriteBudget`,
      and `syncdiag`'s copies are gone. `syncdiag.RetryAfterSecs` survives because
      `thumbnail_service.go` calls it, and `RetentionLimit()` survives because the `cycle_report` kind's cap
      and the desktop facts report both read it.

### Open in the record, not assigned to a slice

- [ ] Resolve the transient constant duplication: slice 1 gave `telemetry` its own `WriteBudget`,
      `RetryAfterSecs`, `MaxBodyBytes`, `IngestOutcome` and `ErrWriteBudget` so the generic store never
      imports a kind implementation, while `syncdiag` keeps its own copies meanwhile. The end state is
      exactly one owner.
- [ ] Retire the legacy schema's three speculative indexes with the old table, and carry the recorded
      finding: no query in `reader.go` filters on `..._trigger_source`, `..._previous_outcome` or
      `..._previous_error_fingerprint` — `ReportQuery` carries only `DeviceID` and `Limit` — so they cost
      write time for nothing.
- [ ] RED guard for the wrong comment above `validateRecentEvents` and its uncovered
      400-on-unknown-key-inside-a-`recent_events`-element path. Found by mobile; a comment and test gap,
      not a behaviour change.

### Deferred, needing an explicit owner decision

- [ ] A **deliberately-invoked one-off** script to reshape historical `device_sync_diagnostics` rows into
      the new shape — that is, invoked by a person once, wired into nothing, and deleted after use. Only if
      the owner wants the history: the data is internal and not in backups, so the default is to leave the
      old rows in place, unread, and write no script.
- [ ] Whether MCP captures (`request_captures`) and log-sync ever join this store. They are out of scope:
      `request_captures` backs the user-visible Activity UI and already carries a lifecycle `Migrate` hook,
      so folding it in is a separate work unit with a real UX constraint, not a consequence of this
      decision.
- [ ] The layering inversion: the generic `telemetry` package imports a specific kind's package for
      `*syncdiag.FieldError`. The clean end state is `telemetry` owning the error type and the kinds
      depending on it, which needs the `cycle_report` kind moved out of `telemetry` first.
- [ ] A mobile-side stop-loss: mobile's flush (`sync-diagnostics-flush.helpers.ts:80`) treats `400/413/422`
      as permanent and removes the row, and its undeclared top-level `kind` produced exactly that `400`.
      Nothing in this repo fixes that; it is a mobile-side change.
