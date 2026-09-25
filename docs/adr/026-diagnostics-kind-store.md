# ADR-026: Diagnostics is one store discriminated by `kind`, and the lifecycle never reshapes a row

- **Status**: Accepted and fully implemented: the store, the endpoint dispatch, the `episode_action` kind,
  the refusal vocabulary, the read repoint, and the retirement of the legacy table from the schema registry
  (commits `5bbcbf3`, `2f90928`, `5bb4fdc`, `e1b8025`, `125f304`, `fc206a0`).
  `device_sync_diagnostics` is no longer created on a fresh install, and on an existing one it is never
  dropped, reshaped, renamed or read: it holds its untouched, unread rows, which is the intended end state
  rather than an oversight.
- **Date**: 2026-09-25, the date this change's API-consumer-impact entry carries in `docs/openapi.yaml`.
  The five commits above are dated 2026-09-24.
- **Supersedes**: nothing. It scopes the storage shape that
  `openspec/changes/mobile-log-ingestion/specs/device-sync-diagnostics/spec.md` recorded for the same
  endpoint; that spec stays as historical evidence and is not amended.
- **Related**: `odd/tasks/diagnostics-kind-store.md` (the feature record: every slice contract, its
  verification evidence and its review findings), `docs/openapi.yaml` (`SyncDiagnosticsRefusalCode`, and
  the `oneOf` with `discriminator.propertyName: kind` on `POST /api/sync/diagnostics`),
  `docs/adr/025-sanitization-is-an-egress-rule.md` (the measurement of what the single-shape table cost),
  `openspec/changes/mobile-log-ingestion/proposal.md` (the delivery path this store replaces),
  `internal/persistence/schema.go` (the declarative driver whose limits D2 states), §D2 for
  `ensureRequestCaptureTableRename` and the seven live `Migrate:` hooks as evidence of the refused pattern

## Context

`POST /api/sync/diagnostics` shipped with exactly one shape: the `device_sync_diagnostics` table, 21
columns, one reader, one retention cap, and one thing it could carry. A second telemetry kind in that
arrangement is a new table, a new reader, a new endpoint and a new retention policy — which is what the
original sibling-table proposal asked for, and why it was refused.

The cost of the single-shape arrangement was already measured, not hypothesised. ADR-025 records it as of
2026-09-19: `device_sync_diagnostics` held **212 rows across 6 devices with zero readable paths**, and the
only `SELECT` in the package was the retention prune. The table collected data nothing could query.

Two domains facts drive the decision:

- **Diagnostics, logs and telemetry are one domain, and the number of kinds is unknown.** Kinds will be
  added for the life of the product. A table that grows a column set per kind is the shape that does not
  scale to that; it is not a constraint workaround, it is the wrong shape on its own terms.
- **Write frequencies are heterogeneous.** A single global cap over a high-frequency kind and a
  low-frequency one lets the former evict the latter outright.

The second problem is the delivery path, and it is the reason the store must be durable at all. On the
mobile side, `drainDiagnosticEvents()` (`headless-sync-cycle.helpers.ts:77`) empties the app-wide ring
unconditionally, before the `try` at line 89, 19 lines before the HTTP call that was supposed to carry it.
So every cycle whose reconcile fails destroyed the ring permanently and nothing counted the loss: what
arrived was the minority of what was collected. That is recorded, with the case for a durable client-side
buffer, in `openspec/changes/mobile-log-ingestion/proposal.md`.

Owner constraints, non-negotiable, and the frame for everything below:

- No data migration in the Bridge lifecycle — not at startup, not on install, not on run.
- One table, discriminated by `kind`. Never a table per kind, never a sibling endpoint per kind.
- Diagnostics, MCP and log-sync data is **internal**: not user-visible, not in backups. Its preservation
  never drives a design decision.

## Decision

### D1 — One store discriminated by `kind`, never a table or endpoint per kind

The shipped replacement is one table, `device_telemetry_events`, whose rows are shared by every kind:

| Column | Owned by |
| --- | --- |
| `device_id` | the envelope — taken only from the authenticated bearer token, never the body |
| `reported_at_ms` | the envelope — the bridge's receipt clock |
| `kind` | the envelope — the wire discriminator |
| `event_id` | the envelope — the kind-scoped idempotency key |
| `observed_at_ms` | the envelope — nullable client event time |
| `degraded` | the envelope — nullable fidelity signal |
| `payload_json` | the kind |

A kind is **one complete declaration**: a strict decoder, a validator, a stored projection request and its
own retention budget. The endpoint dispatches on `kind`; an unregistered kind is a `400` naming it; the
store accepts only an already-validated record. `telemetry.DefaultRegistry()` is the single vocabulary
declaration point, and the store is built from the same registry the handler dispatches on, so a kind
cannot be servable and unretainable at the same time.

**Retention is per kind**, and that is the load-bearing part of this decision rather than a detail. A
single global cap over heterogeneous write frequencies lets a high-frequency kind evict a low-frequency
one; per-kind budgets fix the real problem the sibling-table proposal was reaching for, without splitting
one domain into N boundaries.

`cycle_report` is the first kind and delegates to the unchanged `syncdiag` validator, so the first kind's
behaviour is the behaviour that already ships — including its proven closed-vocabulary suite, which was
kept rather than rewritten. `episode_action` is the second, and it required **no schema change, no per-kind
column and no migration**: one registry entry and nothing else.

**Rejected:** a table per kind, or a sibling endpoint per kind. Both re-open the same four-part cost per
kind (table, reader, endpoint, retention), make cross-kind questions un-askable, and answer a growth
problem with N × growth.

### D2 — The lifecycle boundary: the schema driver creates and adds; it never reshapes, moves, drops or reinterprets an existing row

This is the owner's rule and the sharpest line in this ADR. The declarative driver may create tables and
add columns. It MUST NEVER reshape, move, drop or reinterpret a row that already exists. If a historical
rewrite is ever genuinely needed, it is a **deliberately-invoked one-off** — a script invoked by a person
once, wired into nothing, and deleted after use.

| Category | In lifecycle | Why |
| --- | --- | --- |
| Create a new table | Allowed | Every table in this repo is born this way (`EnsureTableSchema`); no existing row is touched |
| The fresh DDL being complete — projections, generated columns, indexes for every kind we know | Required | Designing a deliberately partial schema out of caution about `ALTER` is under-design, not caution |
| Forward schema evolution for a kind that needs a projection | Allowed | Ordinary evolution through the declarative driver; no row rewrite |
| A kind arriving as one complete registry declaration | Required | The registry must be complete, not minimal: decoder, validator, projection, retention |
| Rewrite, move, rename or reinterpret existing diagnostic rows | **Forbidden** | The refused pattern below |

The rule is scoped to **historical data only**. It is not a limit on the future and not a reason to
under-design: every kind from here on gets the complete process and works going forward.

**The offenders, recorded as evidence of the pattern being refused**, kept out of scope in this work:
`internal/sync/sqlite_bootstrap.go` (`ensureRequestCaptureTableRename`) and the seven live `Migrate:`
hooks under `internal/sync/schema_tables.go`, `internal/download/dbschema/schema.go` and
`internal/season/schema.go`.

**The machine owner is a guard test, in two halves.** The shipped half asserts the declared descriptor
itself: `device_telemetry_events` declares a nil `Migrate` and an empty `ColumnAdds`, pinned by test so a
future slice cannot quietly add a hook. The half slice 4b still owes is the behavioural one: apply the full
table set over a database holding legacy `device_sync_diagnostics` rows and assert every row is
byte-identical afterwards, the table still exists, and no `Migrate` or `ColumnAdds` hook ran. Without the
second half the rule is a comment; with it, a future slice that reintroduces a rewrite fails a test.

### D3 — The stored payload is a snake_case contract the envelope does not duplicate

`payload_json` carries only what the envelope columns do not already own. For `cycle_report`,
`syncdiag.Record` marshals with explicit snake_case tags and `json:"-"` on `DeviceID`, `ReportedAtMS` and
`Degraded` — the three fields whose authority is a column. A nil `PreviousCycle` marshals as an explicit
`null`, an empty `RecentEvents` as `[]`, and no field carries `omitempty`. For `episode_action` the payload
is a fixed seven-key snake_case shape, always all present with explicit `null` where a phase carries no
value, and it repeats neither `kind`, nor `observation_id`, nor `observed_at_ms`.

**This was a review finding, and the reason is in the fix.** The first version stored Go field names at
the top level and inside `PreviousCycle`, and carried `DeviceID: ""` and `ReportedAtMS: 0` — fake zero
values duplicating authority the envelope columns own. It was verified by printing the real bytes from a
decode rather than inferred, and fixed before it shipped, because a stored contract is fixed at write
time: changing it later means reshaping rows, which D2 forbids. The test that was supposed to pin it was
circular (`bytes.Equal(payload, json.Marshal(record))` — both sides marshal the same struct, so it passed
under any tag change) and was replaced with a literal golden payload plus proof that the test fails when a
single tag is removed.

**A kind with no declared retention cap is refused, not stored.** `Insert` rejects such a kind before any
database work, returning `Shed` together with `ErrUndeclaredKind`. The one table whose stated purpose is to
be bounded cannot grow without bound through a wiring bug.

### D4 — The refusal vocabulary grows; a status code per case does not

Every refusal `POST /api/sync/diagnostics` emits carries a `code` from `SyncDiagnosticsRefusalCode`, a
closed vocabulary that grows. `kind_not_served` is the **only recoverable member**: the bytes are not
wrong, this build simply does not serve that kind, so a forward roll recovers every row a client kept.
Every other member is permanent.

**Rejected:** a per-case status code, and a single per-case boolean. A boolean expresses exactly one fact,
so a second refusal class needs a second key — the vocabulary becomes a set of flags the client must
enumerate, and each new class is a response-shape change. A status per class spends the status space on
something that belongs in the body: it cannot separate the two `400`s that matter without splitting one
status into many, and it makes every client's permanence policy a function of an HTTP table instead of a
value. One vocabulary absorbs every future class with no new key and no new status, so a client's
permanence policy keeps working when the bridge adds a class, without either side shipping in lockstep.

There is exactly one write site for every refusal, so a class cannot be added at a call site that forgets
its code. `field` stays present only when a field was named and rejected. The `401` is the one refusal this
handler does not write itself — it comes from the shared authentication layer — so it carries no `code`,
and that is documented rather than left to be discovered.

### D5 — Version coupling is not solvable by release ordering, so the client rule is per row

A client can be pointed at a counterpart the user controls, and then release ordering protects nothing. A
client that already sends a kind is answered `400` with no `code` by a bridge build that predates that
kind, and that `400` is not a statement about the bytes — it is a statement about **which build answered**.
Ordering a deploy does not help when the deployed build is not the one that answers.

That is why the client rule is per row rather than per release: a row whose refusal carries no `code`
is **parked**, not discarded. Discarding on status alone would destroy observations that a later bridge
build would have accepted, and the client's outbox is the only copy. The recoverability is in the body
because the status cannot carry it, and the decision is per row because the release sequence cannot
guarantee it.

### D6 — The legacy table is retired from the lifecycle but never dropped

`device_sync_diagnostics` leaves the schema registry, so it is never created again. Existing installs keep
the table and its rows: nothing drops them and nothing reads them, and its rows stay untouched because D2
forbids the alternative. Retiring it also removes what only existed to serve it — the table's DDL and
reader, and the store whose production callers had already moved to the discriminated store in `2f90928`.

The three speculative indexes the legacy schema carried (`..._trigger_source`,
`..._previous_outcome` and `..._previous_error_fingerprint`) are **not** carried over. No query in
`reader.go` filters or sorts on any of them — `ReportQuery` carries only `DeviceID` and `Limit` — so they
bought write cost and nothing else. A payload field is promoted to a queryable projection only when a read
surface actually filters or sorts on it, and the repo's own idiom for that is a `VIRTUAL` generated column
plus an index, exactly as `animeSnapshotsNameKeyExpr` does at `internal/sync/schema.go:24-42`. Its
documented lesson carries over: the `json_valid` guard there is load-bearing, because evaluating an
expression over unreadable JSON raises and fails the whole write.

**Status:** D6 is decided but was not yet delivered at the time of writing. Slice 4b still owes the
registry removal, the deletions and the behavioural guard from D2, so the legacy table was still being
created and was still unread.

## Consequences

- A new telemetry kind is a registry entry and a spec change, not a table, a reader, an endpoint and a
  retention policy. `episode_action` is the proof: no schema change, no per-kind column, no migration.
- Identity is scoped per kind through `UNIQUE (kind, event_id)`. A `cycle_report` key and an
  `episode_action` key never share a uniqueness namespace — the same name-conflation error the shipped
  spec already forbids for `trigger_source`.
- **A cost carried, not hidden — the layering inversion.** The generic `telemetry` package imports a
  specific kind's package for `*syncdiag.FieldError`, which is why a kind's errors render the which-field
  `400`. The clean end state is `telemetry` owning the error type and the kinds depending on it, which
  requires moving the `cycle_report` kind out of `telemetry` first. Inherited from slice 1, recorded in the
  feature record, and explicitly not attempted in this work.
- **A cost carried, not hidden — one accepted mutation survivor.** `store.go`'s prune-error comparison
  (`pruneErr != nil` mutated to `== nil`) survives: its only observable effect is a `log.Printf`, and
  killing it needs global `log.SetOutput` capture. It mirrors the proven `syncdiag` pattern; the threshold
  was not weakened to hide it, and it is to be revisited only if a prune failure ever needs to be
  observable to a caller rather than to a log.
- **A cost carried, not hidden — constants are duplicated transiently.** Slice 1 gave `telemetry` its own
  `WriteBudget`, `RetryAfterSecs`, `MaxBodyBytes`, `IngestOutcome` and `ErrWriteBudget` so the generic
  store never imports a kind implementation, while `syncdiag` keeps its own copies meanwhile. The record
  leaves "exactly one owner remains" unchecked.
- **A cost carried, not hidden — pinning a literal was refused.** Two `episode_action` mutants (the `20000`
  retention literal ±1) were left alive, because the only way to kill them is to assert a production
  constant — the anti-pattern this repository forbids. The mutation score for that kind sits at 0.82
  (50 mutants, 41 killed) with all nine survivors analysed as equivalent or unpinnable; the effective score
  is 1.00 because every kill covers a contract rule.
- The legacy table's rows stay in place and unread. The record keeps one deferred decision with an explicit
  owner: whether to write a deliberately-invoked one-off script to reshape them. The default is to leave
  them unread and write nothing, because the data is internal and not in backups — so its preservation
  never drives a design decision.
- MCP captures (`request_captures`) and log-sync are **not** folded in. `request_captures` backs the
  user-visible Activity UI and already carries a lifecycle `Migrate` hook, so joining it to this store is a
  separate work unit with a real UX constraint, not a consequence of this decision.
