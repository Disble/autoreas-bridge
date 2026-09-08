# Design: Device Sync Diagnostics Ingestion

## Technical Approach

New bounded context `internal/observability/syncdiag` (sibling of `eventlog`,
never an extension of it) owns the wire contract, closed-vocabulary validation,
the `device_sync_diagnostics` table and its bounded write. A thin transport
adapter `internal/api/handlers/sync_diagnostics_handler.go` follows the
`season_rating_handler.go` template verbatim: method → `authenticate` → seam
nil-check → strict decode → seam call → outcome switch.

## Wire envelope — read off the client, not inferred

`toWireSyncCycleTelemetry` (`autoreas-mobile/src/features/sync/sync-telemetry.helpers.ts:207-238`)
emits exactly seven keys. `degraded` is added at position 2 by the work that
adopts this endpoint:

    cycle_id, degraded, trigger_source, app_state, previous_cycle, counters, recent_events

Three consequences the proposal and explore did not capture, each verified:

1. **There is no top-level `outcome`, `last_stage`, `error_*`, `started_at` or
   `elapsed_ms`.** Every one of those exists *only* inside `previous_cycle`
   (`:216-230`) — which is coherent: the reporting cycle is still running when
   it reports, so it has no outcome yet. Explore's proposed column list has a
   current-cycle `outcome`/`last_stage`/`error_cause` the wire never carries.
2. **`counters` is a nested object** with exactly `consecutive_unclosed_cycles`,
   `pending_ops_count`, `cursor` (`:231-235`). This resolves the `cursor` open
   question: it is a counter, so `INTEGER`.
3. **`recent_events[]` is `{source, event, cause, first_at, last_at, count}`**
   (`sync-diagnostic-events.helpers.ts:63-74`), and the key is `started_at`,
   not `started_at_ms`.

**Column-naming correction to the proposal.** It lists indexes on `outcome` and
`error_fingerprint`. Those are previous-cycle fields, so the columns are
`previous_outcome` and `previous_error_fingerprint`. Same data, same queries,
accurate names — not a scope change.

`SYNC_CYCLE_TELEMETRY_MAX_BYTES = 4096` (`sync-telemetry.constants.ts:109`)
confirms `MaxBodyBytes = 8 << 10` as exactly 2x the client cap.

## Architecture Decisions

### Decision: the 2 s bounds `ExecContext`, never the response

**Choice**: the store owns the deadline. `InsertReport` applies
`context.WithTimeout(ctx, WriteBudget)` around a single `ExecContext` and
returns `ErrWriteBudget` (wrapping `context.DeadlineExceeded`).
**Rejected**: a handler-owned deadline (a caller can forget it); any
`http.Server` write or response deadline.
**Rationale**: no `http.Server` timeout interrupts a handler goroutine — a
response deadline answers 503 while the goroutine keeps running and keeps
holding the single shared connection, protecting nothing while appearing to
work, and passing a status-code-only test. Under `database/sql` the **pool wait
is context-aware**, so `ExecContext` returns `DeadlineExceeded` *while still
queued*. Owning the deadline inside the store makes that the only reachable
path.

**The 2 s deliberately preempts `busyTimeoutMillis = 5000`
(`sqlite_bootstrap.go:28`), and the constant carries a comment saying so**, in
these terms: diagnostics are the lowest-value traffic here, so this path yields
rather than competes; `busy_timeout` is a global connection default and a
shorter per-route deadline is policy, not a lie about it. Under
`SetMaxOpenConns(1)` the dominant wait is the Go pool wait anyway, so the
interaction is largely theoretical. Mobile's client timeout is dead inside the
headless task, so our response is their only exit and answering sooner is
strictly better for them. Without that comment a later reader lengthens the
budget believing they are fixing a bug.

**Why a shorter budget is actively better, not merely cheaper**: `database/sql`
grants a freed connection to waiters in an **unspecified order**, so a waiter's
residency in the queue is time spent competing for grants against work that
matters more. At 2 s a shed diagnostic spends a third as long competing with
reconcile as it would at 6 s. Waiting does not *hold* the connection, but it
does contend for it — which is the argument for the shortest budget that still
lets an uncontended write through, not the longest one SQLite would tolerate.

### Decision: idempotency — not the deadline — is what makes retry safe

`cycle_id` UNIQUE + `ON CONFLICT DO NOTHING` + `204` on the duplicate means a
blind retry is always correct. This matters because mobile's client timeout may
never fire inside the headless task, so "did it land?" is unanswerable from the
client; the deadline bounds *our* contention, it does not answer *their*
question. A reader who assumes the deadline is what makes retries safe will
eventually weaken the UNIQUE constraint.

### Decision: `503` carries `Retry-After: 5`, and `204` is unreachable on that path

**Choice**: the shed path sets `Retry-After: 5` — 2.5x the write budget, past
the contention window that caused the shed, and the only bound on an outbox
retry tighter than the client's own tick.
**Rationale**: this endpoint sheds *deliberately*, so the response must
distinguish "come back shortly" from "something is broken"; the side that knows
why it shed should inform the cadence rather than leaving the client to guess.

**Client semantics, so no server-side behaviour assumes prompt return**: mobile
cannot sleep on the header — its timers are dead in the headless task. It
persists the value as a not-before timestamp and compares it against the clock
at the next cycle. In the background task the cadence is the 15-minute
scheduler, so any short value is satisfied trivially; only the 15-second
foreground ticker can act on it promptly. **A rising 503 rate therefore does not
mean clients are hammering** — most cannot come back quickly even when asked.

**`204` must be unreachable when nothing was stored.** The client's drain is
destructive and gated on a 2xx, so "not stored" indistinguishable from "stored"
is silent data loss. Enforced by an explicit test, not by trusting control flow.

### Decision: single statement, prune outside the write

**Choice**: `INSERT … ON CONFLICT DO NOTHING` alone — no `Begin()`/`Commit()`.
The row is durable when `ExecContext` returns. Prune is a *separate*
`ExecContext`; its failure is logged and swallowed.
**Rejected**: eventlog's BEGIN/INSERT/prune/COMMIT.
**Rationale**: one row per request; a transaction only lengthens residency on
the shared connection, and a prune failure must never turn a durable insert into
an error. `inserted, _ := res.RowsAffected(); inserted == 1` drives both the
`Duplicate` outcome and the prune counter, so a conflict no-op never counts.

### Decision: two `trigger_source` vocabularies, two validators, two columns

Verified at `sync-telemetry.types.ts:40`: `PreviousCycleTelemetry.triggerSource`
is `SyncRuntimeTriggerSource | null`, a **different type** from the top-level
one.

| Position | Members | Validator | Meaning |
|---|---|---|---|
| top-level `trigger_source` | 2: `foreground_service`, `background_task` | `telemetrySenderTriggerSources` | which scheduler **sent this telemetry** — only the two headless call sites supply a context, so an off-list value is a client bug worth failing loudly |
| `previous_cycle.trigger_source` | 9: + `bootstrap`, `manual`, `app_active`, `network_regained`, `local_mutation`, `local_mutation_write`, `ws_sync_required` | `syncAttemptTriggerSources` | which scheduler **ran the previous cycle** — a column any caller writes, including foreground paths that never send telemetry |

A single shared `triggerSource` constant would silently make one position wrong.
They land in separate columns, which makes conflation structurally impossible
rather than merely discouraged, and both DDL comments name which is which.

### Decision: absent vs explicit null via `json.RawMessage`

`*T` cannot distinguish a missing key from `null`; both decode to nil. The two
keys where the difference is contractual use raw:

```go
type wireReport struct {
    CycleID       string          `json:"cycle_id"`
    Degraded      json.RawMessage `json:"degraded"`       // nil = key absent → reject
    TriggerSource string          `json:"trigger_source"`
    AppState      string          `json:"app_state"`
    PreviousCycle json.RawMessage `json:"previous_cycle"` // "null" = explicit → accept
    Counters      *wireCounters   `json:"counters"`
    RecentEvents  []wireEvent     `json:"recent_events"`
}
```

Field order mirrors the wire envelope. Inside a non-null `previous_cycle`, only
`outcome` is required (`sync-telemetry.types.ts:41` types it non-nullable);
every other field is `*T` and accepts absent **and** null alike — over-tight
presence there is the failure mode proposal Decision 4 warns about.

### Decision: non-enumerated field shapes

| Field | Rule |
|---|---|
| `cycle_id`, `previous_cycle.cycle_id` | UUID shape |
| `error_fingerprint` | **`^[0-9a-f]{8}$`** — exactly 8 lowercase hex, fixed length |
| `native_errcode_byte` | integer 0–65535 |
| counters, `started_at`, `elapsed_ms`, `count`, `first_at`, `last_at` | bounded integers |
| `recent_events` | **≤32 entries accepted, rejected beyond** (the client's own ring caps at 20; 32 is deliberate server-side headroom, NOT the client's number) |

`error_fingerprint` is FNV-1a rendered `(hash >>> 0).toString(16).padStart(8,'0')`
(`sync-telemetry.helpers.ts:343-352`). An identifier-shaped pattern like
`^[A-Za-z_$][A-Za-z0-9_$]{0,63}$` rejects every digit-leading value — ~62% of
real ones — and the field is non-null **only for unrecognized error classes**,
so it would reject exactly the novel-failure payloads it exists to capture.

### Decision: index shape

| Index | Rationale |
|---|---|
| `cycle_id TEXT NOT NULL UNIQUE` inline in `CreateDDL` | The implicit index serves `ON CONFLICT DO NOTHING`; a second `CREATE INDEX` would be pure write cost. |
| `(trigger_source, reported_at_ms DESC)` | 2 members alone never wins a plan; the real query is "last N cycles by sender". |
| `(previous_outcome, reported_at_ms DESC)` | Same, 3 members. |
| `previous_error_fingerprint` | High cardinality, equality lookup. |
| `(device_id, reported_at_ms DESC)` | Per-device time window. |
| **`degraded` — not indexed** | ≤4 members, mostly NULL, never filtered alone. On top of the write cost, **an index invites exactly the aggregate query that misreads the column** (see below). |

No global time index: the prune sorts ≤5,000 rows every 100 writes. Deliberate.

### Decision: `device_id` from the token; `reported_at_ms` from the bridge clock

Strict decode makes a body-supplied `device_id` a `400`. The trusted value is
`authenticate()`'s `device.PairedDevice.DeviceID`. `reported_at_ms` is the
**bridge's** receipt clock — retention ordering must not depend on device
clocks; `previous_started_at` is the device's.

## Required DDL comments

Three comments are load-bearing and easy to lose:

- **`degraded` is a FIDELITY signal, not a health signal.** It is the only
  column decided by the size cap at serialization time rather than by anything
  the cycle observed; every other column projects device state. The consequence
  is counter-intuitive: **a perfectly healthy cycle with a full event ring can
  ship `degraded = 'events'`.** It reports how complete the record is, not how
  the device is doing — `degraded IS NOT NULL` is not a health indicator.
  Plus the cascade implication verbatim: *"Each value implies every lighter
  piece is ABSENT from this payload — shed or never present. It does not assert
  that a lighter piece was dropped."* Shed order `events` → `error_detail` →
  `previous_cycle` is a contract; the implication depends on it being total
  (`capWireSyncCycleTelemetry:264-313`).
- **`native_errcode_byte` is a char code, not a SQLite result code.** `5` means
  the control byte was `0x05`, **not** `SQLITE_BUSY`. Someone will eventually
  try to join it against SQLite codes.
- **`app_state` is stored but never a filter dimension.** The client hardcodes
  it to `background` (`headless-sync-cycle.helpers.ts:76`), so a
  `foreground_service` cycle reports `background`. `trigger_source` is the only
  trustworthy discriminator.

## Data Flow

    POST /api/sync/diagnostics
      │
      ├─ authenticate() ────────────── 401 (no row)
      ├─ MaxBytesReader(8 KiB) ─────── 413
      ├─ DisallowUnknownFields() ───── 400 {error, field}
      ├─ syncdiag.Validate(wire) ───── 400 {error, field}   ← 11 closed vocabularies
      │        └─ recent_events re-serialized from validated values
      └─ Ingest(ctx, Record)
               └─ store.InsertReport   ctx+2s → ExecContext
                    ├─ rows=1 → Stored ─────── 204
                    ├─ rows=0 → Duplicate ──── 204   (ON CONFLICT DO NOTHING)
                    ├─ ErrWriteBudget ──────── 503 + Retry-After: 5
                    └─ other ───────────────── 500
                    (rows=1 → counter++ → prune every 100, errors swallowed)

## Schema — 21 columns

Envelope: `device_id`, `reported_at_ms`, `cycle_id` (UNIQUE NOT NULL),
`degraded`, `trigger_source` (NOT NULL), `app_state` (NOT NULL),
`consecutive_unclosed_cycles` (NOT NULL), `pending_ops_count` (NOT NULL),
`cursor` (NOT NULL), `recent_events_json` (NOT NULL, `'[]'` when empty).

Previous cycle, all nullable — the whole object may be null, so
`previous_outcome`'s non-nullability is enforced in **validation, not DDL**:
`previous_cycle_id`, `previous_trigger_source`, `previous_outcome`,
`previous_last_stage`, `previous_started_at`, `previous_elapsed_ms`,
`previous_error_name`, `previous_native_errcode_byte`, `previous_error_stage`,
`previous_error_cause`, `previous_error_fingerprint`.

The `counters` key is required and **all three members are non-null**. Confirmed
with the mobile side: `cursor` comes from `getLastChangelogId`, which returns `0`
for anything absent, non-numeric or out of range, so there is no null to model.
`INTEGER NOT NULL` for all three; no apply-time check needed.

## File Changes

| File | Action | Description |
|---|---|---|
| `internal/observability/syncdiag/schema.go` | Create | Full `CreateDDL` + 4 indexes + `SchemaTables()`. No `ColumnAdds`, no `Migrate` — the table is born complete, so the hook is never invoked. Carries the three required comments. |
| `internal/observability/syncdiag/types.go` | Create | `Record`, `PreviousCycle`, `RecentEvent`, `StoreConfig`, `IngestOutcome`, `ErrWriteBudget`, `FieldError`, constants. |
| `internal/observability/syncdiag/vocabulary.go` | Create | 11 table-driven vocabularies, one line per new member; the two `trigger_source` sets distinctly named. |
| `internal/observability/syncdiag/validate.go` | Create | `Validate(wireReport) (Record, error)`; rejects, never coerces; every rejection returns `FieldError{Field, Reason}`. |
| `internal/observability/syncdiag/store.go` | Create | `InsertReport(ctx, Record) (IngestOutcome, error)`, deadline, prune. |
| `internal/api/handlers/sync_diagnostics_handler.go` | Create | Transport only. |
| `internal/api/server.go` | Modify | `IngestSyncDiagnostics` on `Config`. |
| `internal/api/router.go` | Modify | Builder + one exact-path route `/api/sync/diagnostics` (cannot collide with the `/api/devices/` subtree). |
| `internal/sync/sqlite_bootstrap.go` | Modify | One line in `initializeBridgeDB` (`:160-164`). |
| `internal/desktop/app_startup_runtime.go` | Modify | One `api.Config` field wired from `a.bridgeDB`. |
| `internal/api/contracts/contracts.go` | Modify | `ClientTelemetry json.RawMessage` — declare-and-ignore, comment naming `decodeReconcileRequest`'s missing `DisallowUnknownFields()` as the precondition. |
| `docs/openapi.yaml` | Modify | New path; `client_telemetry` optional/deprecated. |

## Interfaces / Contracts

```go
const (
    WriteBudget    = 2 * time.Second // preempts busy_timeout ON PURPOSE — see Decision 1
    RetryAfterSecs = 5
    MaxBodyBytes   = 8 << 10 // 2x SYNC_CYCLE_TELEMETRY_MAX_BYTES (4096)
    retentionLimit = 5000
    pruneEvery     = 100
)
type IngestOutcome int // Stored | Duplicate | Shed
type FieldError struct{ Field, Reason string } // → 400 {"error":…,"field":…}
```

`FieldError` justifies the one non-house response shape: mobile must log *which*
member the bridge rejected, and substring-parsing `{"error":…}` is worse.

## Retention

Copy `requestcapture`'s 5000/100. Prune deletes oldest-first by
`reported_at_ms`. **Prune unconditionally on the first write of each process**,
as `eventlog/store.go:60-63` actually does (`s.successful > 1 && …`).
*Correction*: the proposal reads that line as seeding the counter from an
existing row count. It does not, and `requestcapture/store.go:95` has no such
escape at all. Prune-on-first-write satisfies the same stated intent — a session
writing <100 rows must still prune — with no `COUNT(*)` on the single shared
connection at construction.

## Testing Strategy (strict TDD — RED test names per work unit)

| Slice | RED tests |
|---|---|
| 1 storage | `TestSchemaTablesCreatesTableAndIndexes`; `TestInsertReportStoresRow`; `TestInsertReportDuplicateCycleIDReturnsDuplicateAndNoSecondRow`; `TestInsertReportPreviousCycleFieldsNullable` (subtest per nullable field); `TestInsertReportShedsUnderHeldConnection`; `TestPrunesOnFirstWriteOfProcess`; `TestRetentionHoldsRowCountUnderSustainedWrites` |
| 2 validation | `TestValidateRejectsUnknownField`; `TestValidateRejectsOffVocabularyValue` (table over all 11 vocabularies, naming the field); `TestValidateRejectsTopLevelTriggerSourceLocalMutation`; `TestValidateAcceptsPreviousTriggerSourceLocalMutation`; `TestValidateAcceptsDigitLeadingErrorFingerprint`; `TestValidateRejectsMissingPreviousCycleKey`; `TestValidateAcceptsExplicitNullPreviousCycle`; `TestValidateAcceptsPreviousCycleWithOnlyOutcome`; `TestValidateRejectsMissingDegradedKey`; `TestValidateRecentEventsReserializedDropsInjectedField`; `TestValidateRejectsAdversarialPayload` (path, SQL fragment, anime title) |
| 3 endpoint | `TestSyncDiagnosticsRequiresBearerToken`; `TestSyncDiagnosticsRejectsOversizeBody`; `TestSyncDiagnosticsAcks204`; `TestSyncDiagnosticsDuplicateAcks204`; `TestSyncDiagnosticsShedReturns503WithRetryAfter`; `TestSyncDiagnosticsShedNeverReturns204`; `TestSyncDiagnosticsUsesTokenDeviceIDNotBody` |
| 4 contract | `TestReconcileStillAcceptsClientTelemetry`; `TestReconcileResponseUnchanged` |

**The contention test is the load-bearing one — it is the only thing separating
a correct implementation from a response-deadline one.** A status-code assertion
passes against the broken version. **So does an elapsed-time assertion**: a
response-deadline implementation also returns at the budget, it just keeps
running afterwards. Neither is sufficient alone.

`TestInsertReportShedsUnderHeldConnection` MUST assert **the connection was
released** — that no write is outstanding once the call returns. With
`StoreConfig{WriteBudget: 150ms}`: hold the single connection with `db.Begin()`,
assert `errors.Is(err, syncdiag.ErrWriteBudget)`, assert elapsed ∈
[budget, budget+slack], then **release the holder, wait, and assert the table is
still empty**. That last step is the whole test: a goroutine still queued for the
connection would land its row there after the holder frees it.

`TestSyncDiagnosticsShedReturns503WithRetryAfter` asserts the header alongside
the status.

**Apply note — use `json.RawMessage`, not `*T`.** The absent-vs-null distinction
is a mechanism choice, not a style one: a pointer field silently collapses "key
missing" and "key present, value null" into the same nil, which is exactly the
distinction the `previous_cycle` and `degraded` rules are built on. Tasks must
name the mechanism so apply does not reach for the pointer by reflex.

MUTATE (mandatory after GREEN):
`ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/observability/syncdiag/"`.

## Threat Matrix

Included because this change adds a route. Every row of
`references/threat-matrix.md` targets shell/VCS/PR automation and is **N/A**:
documentation-like paths (no file classification or execution); git repository
selection, commit state, push state, PR commands (no VCS, remote, subprocess or
argument composition anywhere in this change).

HTTP-boundary addendum (the real boundary), each mapped to a RED test above:
unauthenticated POST → `401`, no row; oversize body → `413` before decode;
unknown field or off-vocabulary member → `400` naming the field; free text
smuggled through `recent_events` → dropped by re-serialization; body-supplied
`device_id` → `400`; exact-path registration prevents the `/api/devices/`
subtree collision.

## Migration / Rollout

Additive only. `CreateDDL` on a fresh table; no `Migrate`, no backfill.
Dual-write per the proposal: the same `cycle_id` on both legs is already handled
by `ON CONFLICT DO NOTHING`. Rollback = revert the commit range; the table is
orphaned, not dropped.

**`degraded` is validated as required from day one, and today's client does not
emit it — this is correct, not a defect.** `toWireSyncCycleTelemetry:207-238`
has no `degraded` key today; mobile ships it in the first version that POSTs to
this endpoint at all, dual-write included, so no request that ever reaches this
route can lack it. There is no optional-then-required migration to stage. During
apply, a hand-built payload copied from today's `client_telemetry` will be
rejected for a missing `degraded` — that is the contract working, not a bug to
"fix" by relaxing the check.

## Review Workload — re-cut to four slices

The proposal's ~870 lines split 350/410/110. Slice 2 bundled validation with
transport, making it the largest and highest-risk unit. Re-cut on the package
boundary (validation is pure and testable without HTTP); each slice ships alone:

| # | Slice | ~lines | Test command |
|---|---|---|---|
| 1 | Storage: schema, `SchemaTables()`, bootstrap line, store, idempotency, retention | 300 | `go test -count=1 ./internal/observability/syncdiag/` |
| 2 | Validation: wire types, 11 vocabularies, `Validate`, `recent_events` re-serialization | 280 | `go test -count=1 -run TestValidate ./internal/observability/syncdiag/` |
| 3 | Endpoint: handler, seam, router + `Config` + desktop wiring, `httptest` contract | 200 | `go test -count=1 ./internal/api/...` |
| 4 | Contract + docs: `openapi.yaml`, reconcile declare-and-ignore | 110 | `go test -count=1 ./internal/api/handlers/ -run TestReconcile` |

Every slice is under the 800-line session budget and under the 400-line default.

## Open Questions

None. The `cursor` question is fully resolved: it is a member of the nested
`counters` object (`sync-telemetry.helpers.ts:231-235`) and is non-null —
`getLastChangelogId` returns `0` for absent, non-numeric or out-of-range values.
`INTEGER NOT NULL`.
</content>
