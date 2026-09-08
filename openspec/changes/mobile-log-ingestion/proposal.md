# Proposal: Device Sync Diagnostics Ingestion

## Intent

**The current arrangement silently destroys most of the diagnostic data it
collects.** In `autoreas-mobile`'s `headless-sync-cycle.helpers.ts`,
`drainDiagnosticEvents()` empties the app-wide ring at line 77 —
unconditionally, before the `try` at line 89, and 19 lines before the HTTP
call at line 96 that was supposed to carry it. One call site, no re-buffer
anywhere. So **every cycle whose reconcile fails destroys the ring
permanently**, and nothing counts the loss.

That is not an edge case here. This is a local-first API: the device
disconnects constantly and reconnects eventually, so a request *arriving* is
not the normal case — *not* arriving is. The discarded content includes
`ws_*`, `mutation_failed`, `mutation_sync_failed`, `resync_failed`, and
`headless_task_missing` — the one signal that answers whether the host kept JS
timers alive, which is the leading hypothesis for why the background service
dies. **The design discards that evidence precisely when the device is in the
state that produces it.**

Post-mortems fail the same way: each cycle carries only its immediate
predecessor's, so a device offline for N cycles transmits 1 of N. At the
15-minute background interval, a day offline delivers one post-mortem and
discards roughly 95.

Second, and only second: what does arrive is unqueryable.

The correct shape is a dedicated endpoint plus a durable client-side buffer
with retry — what mobile crash/diagnostic SDKs do, queueing envelopes to disk
and flushing on reconnect rather than piggybacking on the host app's API calls.
**Endpoint reachability was never the load-bearing part; the local buffer is.**

Success: the ring survives a failed delivery, and `cycle_id`/`trigger_source`/
`outcome` are a `WHERE` clause.

## Scope

### In Scope

- `POST /api/sync/diagnostics` — authenticated, strict-decode, synchronous
  insert under a bounded write budget, then bare `2xx` ack. No ack unless the
  row is durable.
- New `device_sync_diagnostics` table: `cycle_id` UNIQUE, `trigger_source`,
  `previous_outcome`, `previous_error_fingerprint` and
  `(device_id, reported_at_ms)` indexed.
- Server-side validation against closed vocabularies; off-list values
  **rejected**, never coerced.
- A `degraded` column recording what mobile shed to fit its size budget.
- Idempotent insert (`ON CONFLICT DO NOTHING`, `2xx` on duplicate).
- Retention on the house `RetentionLimit`/`PruneEvery` pattern.
- Declare-and-ignore `client_telemetry` on `ReconcileRequest`.
- `docs/openapi.yaml`: the new endpoint, plus `client_telemetry` as optional,
  accepted, stored raw, uninterpreted, deprecated.

### Out of Scope

- Any `autoreas-mobile` change, including their durable telemetry outbox.
- **The requestcapture sanitization drift** and **the unbounded request
  handling defect** — both recorded below, neither fixed here.
- An MCP read tool over the new table — see Risks.
- `DisallowUnknownFields()` on reconcile: it would 400 every mobile reconcile
  until mobile cuts over.
- Reuse of the capture's `error_code`; any filter on `app_state`.

## Capabilities

### New Capabilities

- `device-sync-diagnostics`: the ingest endpoint, its wire contract, storage
  schema, vocabulary validation, nullability and degradation rules,
  idempotency, ack semantics, write budget, and retention.

### Modified Capabilities

None. `observability`, `rest-api-middlewares-auth` and `mobile-request-mcp`
are all unchanged.

## Recorded defects — deliberately out of scope

### 1. Observability sanitization drift

`openspec/specs/observability/spec.md` → "Sanitization and Privacy Are
Default-Deny" requires only a sanctioned sanitized subset and forbids
unrestricted raw request bodies. `internal/observability/requestcapture/
telemetry.go` stores raw bodies verbatim, keeps the `Authorization` key with a
`[redacted]` value (line 57), and touches only four credential header names.
Line 62 states this is a deliberate value-scoped denylist. `SanitizerConfig`'s
`AllowedHeaders`/`AllowedBodyKeys` still compile but are dead metadata.

Not fixed here: that drift lives in `requestcapture`; this endpoint has its own
table, contract and validation and never writes through that subsystem.
**This endpoint does not inherit the denylist precedent** — it enforces
closed-vocabulary allowlist validation on its own data. Separate follow-up
recommended.

### 2. Request handling is unbounded on both ends

**The 2 s write budget below bounds this endpoint only.** The reconcile path —
the one carrying the actual sync work — stays unbounded until a follow-up
lands. Stating that explicitly matters: the new endpoint being the *only*
bounded path in the system is exactly the shape that makes a later reader
assume the problem is solved.

- **Bridge**: `&http.Server{Handler: s.handler}` (`internal/api/server.go:146`)
  with no `ReadTimeout`, `WriteTimeout`, `IdleTimeout` or `ReadHeaderTimeout`.
  No `context.WithTimeout` anywhere in the API or sync handlers.
  `SetMaxOpenConns(1)`.
- **Mobile**: every bound in that repo is `setTimeout`-based, and Android
  pauses JS timers inside the headless background task — so the request abort,
  the write-door deadline and the cycle deadline all die at once. `fetch` is
  native and keeps working, so the request goes out and simply never gets an
  answer.

Composed: a background reconcile issued while the single SQLite connection is
held by a long write has **no bound on either side** and hangs until the host
kills the process. This is the **leading candidate** explanation for a
measured, unexplained mobile-side observation — background cycles running the
full 600 s in complete silence, confirmed on device 2026-09-04. **Not
proven.**

Note what the full 600 s does and does not tell us: if the hang were purely
contention, a server-side close would have ended those cycles early — and
nothing closes the connection today, so running the full window is *consistent
with* the hypothesis rather than evidence against it. **Confirmation therefore
requires a capture recording whether the connection stayed open for the whole
window, not only whether the DB was blocked at that instant.** That is what
separates "blocked on the shared connection" from "request never answered for
another reason", and the two need different fixes.

Three corrections so the follow-up is not underestimated:

1. `ReadHeaderTimeout` does **not** bound this path. It bounds reading request
   headers (Slowloris protection). Here the headers arrive fine and the block
   is in the handler afterwards.
2. The relevant field is `WriteTimeout`, but it is **not** a safe one-line
   addition: `/ws` is registered on the same mux as reconcile
   (`internal/api/router.go:121` and `:106`) and served by that same single
   `http.Server`. A global `WriteTimeout` would kill every long-lived
   WebSocket connection.
3. **No `http.Server` timeout fixes the contention at all.** `WriteTimeout`
   deadlines the connection write; it does not interrupt the handler
   goroutine, so it would unblock the client while the bridge goroutine keeps
   running and keeps holding the connection.

**The follow-up is two remediations with different beneficiaries, and neither
substitutes for the other.** Recording only one is the likely failure: whoever
picks this up will do the server-side half, observe the contention resolved,
and never add the piece that actually rescues the phone.

- **Per-route write deadline → rescues the client.** A server-side connection
  close propagates to mobile *natively*: OkHttp signals it through a callback,
  not a timer, so it works even inside the headless task where every
  `setTimeout` is dead, and it surfaces as `BridgeUnreachableError`
  (`bridge-client.helpers.ts:100`), already classified transient by their
  retry path. **This is the only mechanism in the entire system that can
  unblock a hung background cycle** — not ergonomics, the only exit.
- **Handler-level DB context deadlines → fix the bridge's contention.** They
  bound the goroutine and free the connection. They do nothing for a client
  already hung on a socket that stays open.

So the follow-up is a design change across every DB-touching handler plus
per-route deadline handling — not a struct-field addition. That is why it is
out of scope here, and why this record is load-bearing rather than hygiene.

## Approach

### Decision 1 — naming: `device`, not `mobile`

`capture-nomenclature-rename` dropped `mobile` from transport-neutral surfaces
because the trust boundary is `device.PairedDevice`. Table
`device_sync_diagnostics` sits beside the existing `device_sync_state`, which
has the same per-device ownership shape.

Route is `/api/sync/diagnostics`, not `/api/devices/diagnostics`: the resource
is a sync-cycle report, not a device, and `/api/devices/` is already a
`ServeMux` subtree owned by `handleDeviceByID` (`internal/api/router.go:100`),
which would otherwise read `diagnostics` as a device id.

### Decision 2 — sanitization: allowlist, because every field is closed

| Field | Members |
|---|---|
| `outcome` | `completed`, `failed`, `never_closed` |
| `trigger_source` | `foreground_service`, `background_task` |
| `last_stage` | `open`, `config`, `attempt_started`, `cycle_activated`, `backlog_read`, `claim_ops`, `http`, `parse_response`, `apply_write`, `prune`, `closed` |
| `error_name` | `LocalWriteError`, `BridgeTimeoutError`, `BridgeUnreachableError`, `ReconcileHttpError`, `SchemaValidationError`, `unknown` |
| `error_stage` | `begin`, `task`, `commit`, `rollback`, `deadline`, `unknown` |
| `error_cause` | `closed_resource`, `lock_contention`, `disk_full`, `io_error`, `timeout`, `unreachable`, `unknown` |
| `app_state` | `foreground`, `background` (stored, never a filter) |
| `degraded` | `null`, `events`, `error_detail`, `previous_cycle` |
| `recent_events[].source` | 7 members (`sync_cycle` … `reconcile_conflict`) |
| `recent_events[].event` | 13 members (`ws_opened` … `conflict_operation_stalled`) |

Mobile already collapses off-list values client-side. **We benefit from that
and MUST NOT rely on it**: a modified or compromised client can send anything.

**Reject, do not coerce.** An off-list value returns `4xx` naming the offending
field. Silently rewriting it to `unknown` would launder a client bug — or a
client mobile does not control — into valid-looking data. (`unknown` is itself
a legitimate wire value in three vocabularies; what is rejected is anything
off-list.)

Non-enumerated fields:

| Field | Policy |
|---|---|
| `cycle_id`, `previous_cycle.cycle_id` | UUID shape |
| `error_fingerprint` | Identifier/hash shape |
| `native_errcode_byte` | Bounded integer 0–65535 |
| `elapsed_ms`, `started_at`, counters, `count`/`first_at`/`last_at` | Bounded integers |
| `recent_events` | **≤32 entries accepted, rejected beyond** (the client's own ring caps at 20; 32 is deliberate server-side headroom, NOT the client's number) |

Two consequences for design:

1. **`recent_events` is re-serialized server-side from validated values, never
   stored as received.** Persisting the client's raw blob would bypass every
   check above for the one genuinely variable-shape field.
2. **`native_errcode_byte` is a char code, not a SQLite result code.** The DDL
   comment must say so: `5` means the control byte was `0x05`, NOT
   `SQLITE_BUSY`. Naming it `error_code` would invite a meaningless join.

Net effect: **no free-text column.** Body bounded by `MaxBytesReader` at 8 KiB
(2× mobile's 4 KiB cap).

### Decision 3 — `degraded`: one column that keeps shedding visible

`previous_cycle: null` is **overloaded on the wire**. It means either "no cycle
has ever run" (first install, cleared storage — `derivePreviousCycleOutcome`
returns null when `snapshot.lastAttemptAt === null`) **or** "a real previous
cycle existed and was shed to fit the 4 KiB budget"
(`capWireSyncCycleTelemetry:305`). From the bridge these are
indistinguishable. `recent_events: []` carries the identical overload.

Unresolved, a cluster of `previous_cycle: null` reads as a wave of fresh
installs when it may be payloads going over budget — and budget pressure would
be **completely invisible**. That is the same invisible-loss failure mode this
change exists to eliminate; reproducing it in the new contract would be a poor
trade.

So: a `degraded` column, `null | events | error_detail | previous_cycle`,
nullable, required key, validated and rejected like every other vocabulary.

**Schema comment must pin the implication**, in exactly these terms:

> Each value implies every lighter piece is ABSENT from this payload — shed or
> never present. It does not assert that a lighter piece was dropped.

The weaker "is absent" reading is the correct one *and* the one a query writer
actually needs. Nobody needs to know whether an empty ring was dropped or
never filled; they must not read a lighter field's emptiness as signal when a
heavier shed occurred.

Shedding order is `events` → `error_detail` → `previous_cycle`, and **that
order is a contract, not an implementation detail**: the "absent" implication
depends on the ordering being total. If any piece ever becomes independently
sheddable, the implication breaks — a two-sided contract change.

**Present from the very first request**, including throughout dual-write; it
does not wait on mobile's outbox work. Validate it as required from day one:
there is no optional-then-required migration to stage.

Expected to be rare (measured payloads ~474 B against a 4096 B ceiling, so
shedding is defence in depth rather than routine). It earns its column not on
frequency but on cost asymmetry: one column now versus a two-sided contract
revision later plus a table of permanently ambiguous nulls that cannot be
backfilled.

**Not indexed.** Low cardinality and mostly null; the queries that matter
filter on `outcome`, `trigger_source` or time first, so an index here would
cost writes on every insert and buy almost nothing.

**Known limit, recorded so nobody rediscovers it as a mystery — not work.**
When even the fully-degraded payload exceeds the client budget, mobile omits
the whole envelope and no POST happens at all: uncounted loss. It is
unreachable at the production 4 KiB cap, since with an empty ring the
remainder is a UUID, enum members, integers and a bounded hash totalling a few
hundred bytes; only tests set a cap small enough to reach it. **No field is
proposed for it.**

### Decision 4 — nullability: absent and null are different

`toWireSyncCycleTelemetry` (`sync-telemetry.helpers.ts:212-230`) emits
`previous_cycle: previousCycle ? {...} : null`, and
`capWireSyncCycleTelemetry` (`:263-312`) **sheds by assignment, never by
omission** — it emits `recent_events: []` and `previous_cycle: null` rather
than dropping the keys.

**Every key inside the envelope is therefore always present, which is what
makes reject-on-missing safe**: it cannot misfire on legitimately degraded
traffic. A missing key is a malformed client, not a shed payload.

- **The `previous_cycle` key is always present and may be explicitly `null`.**
  This differs from `client_telemetry` itself, which is *omitted* when empty.
  The column is nullable; **a missing key is rejected**.
- **Inside a non-null `previous_cycle`, `outcome` is the only guaranteed
  non-null field.** Everything else is independently nullable for a perfectly
  valid record: `cycle_id` (null on rows written before cycle ids existed),
  `trigger_source`, `last_stage`, `error_name`, `error_stage`, `error_cause`,
  `error_fingerprint`, `started_at`, `elapsed_ms` (null whenever `now` was not
  injected, **independently of `started_at`**), and `native_errcode_byte`.

**`NOT NULL` on the previous-cycle id column would reject valid records.** The
schema has two distinct id columns: `cycle_id` (the reporting cycle —
`UNIQUE NOT NULL`) and `previous_cycle_id` (nullable, no constraint).

Two `outcome` semantics to pin in the schema comment, both from
`derivePreviousCycleOutcome` checking `isCycleActive` before
`lastFailureMessage`:

- **`never_closed` outranks `failed`.** A cycle can record a failure and then
  be killed before releasing the flag; the kill is the more severe fact and
  must not be masked by the error underneath it.
- **`completed` means "ran and left no failure message", NOT "succeeded at
  syncing anything".**

### Decision 5 — write budget: 2 seconds, and shed rather than queue

**Mobile's client timeout may never fire.** `BRIDGE_REQUEST_TIMEOUT_MS =
10_000` (`bridge-client.constants.ts:30`) is a self-owned `setTimeout` +
`AbortController` (`bridge-client.helpers.ts:72-79`), and Android pauses JS
timers inside the headless background task — confirmed on device 2026-09-04.
Native callbacks still complete, so `fetch` and SQLite keep working; only
timer-driven work is dead. **In exactly the case this endpoint is designed
for, mobile has no working timeout**: if the bridge holds the request, mobile
does not time out and retry — it hangs until the host kills the process, and
the envelope dies with it.

**The server-side deadline this change introduces is the only bound that will
exist for this endpoint.** Treat it as load-bearing.

**2 seconds**, via `context.WithTimeout` around the insert so the
`database/sql` pool wait is bounded. The insert itself is sub-millisecond, so
the budget exists **entirely to bound contention on the single shared
connection** (`SetMaxOpenConns(1)`, `internal/sync/sqlite_bootstrap.go:140-141`
— `internal/sync/backup_import.go:67` and `internal/season/backup_import.go:86`
already warn that a stray query deadlocks for this reason). It sits far below
mobile's 10 s default so **the bridge always answers first**; mobile confirmed
it will set its per-call budget comfortably above whatever we choose.

That the 2 s budget preempts SQLite's own `busyTimeoutMillis = 5000`
(`sqlite_bootstrap.go:28`) is deliberate, not an oversight. That constant is a
global connection setting; giving up before it is exhausted is precisely the
load-shedding this endpoint wants, and it changes nothing for any other
caller.

**The budget MUST bound the database call, not the response.** Implementation
requirement, not a suggestion: the deadline goes on a `context.WithTimeout`
passed to `ExecContext` (or the store method wrapping it). It MUST NOT be a
response or write deadline.

Because no `http.Server` timeout interrupts a handler goroutine, a response
deadline would answer `503` and then **keep running and keep holding the
single SQLite connection** — mobile would be told faster while the contention
we shed for went untouched. Reconcile latency would not actually be protected,
and that failure is invisible from the outside.

What makes the correct version work: under `database/sql` **the pool wait is
context-aware**. `ExecContext` with a 2 s context returns
`context.DeadlineExceeded` *while still waiting for a free connection*, rather
than after acquiring one. That is what turns the deadline into real
load-shedding. Tests must assert shedding under contention, not merely the
`503` status code.

**Shed, do not queue.** On deadline expiry return **`503` immediately** rather
than waiting. Diagnostics are the lowest-value traffic in this system and must
not contend with reconcile for the single connection — **the endpoint protects
reconcile latency**, and that is a design property, not a degradation. Mobile
handles it correctly: `BridgeTimeoutError extends BridgeUnreachableError`, so
every timeout is already classified transient rather than permanent on their
side, and their outbox retries with backoff.

**Non-functional requirement: never hold the request.** Recorded explicitly so
a future change does not "improve" this endpoint by making it wait for the
connection.

`PRAGMA journal_mode = WAL` is set and verified at
`sqlite_bootstrap.go:253-257`, so this writer does not block readers; the
contention is writer-versus-writer and Go-pool-level.

### Decision 6 — idempotency, and it is load-bearing

Because mobile's timeout may never fire, "did it land?" is genuinely
unanswerable from the client. **Idempotency, not the timeout, is what resolves
that ambiguity**: `ON CONFLICT DO NOTHING` with `2xx` on the duplicate means
mobile can retry blind and be correct.

- `cycle_id` is `UNIQUE` (`Crypto.randomUUID`, platform CSPRNG — globally
  unique, so no `device_id` composite is needed). A `UNIQUE` that *errored*
  would turn a successful-but-unacked delivery into a permanent failure,
  reintroducing data loss through the mechanism meant to prevent it.
- **No foreign key** from `previous_cycle_id` to `cycle_id`. The referenced
  cycle may never have been delivered. Dangling by design.
- **Arrival is not monotonic.** A foreground-service tick and the WorkManager
  task can run concurrently; ids stay distinct but records can arrive out of
  order. No read path may assume ordering by arrival.
- A conflict no-op must not count toward the prune write counter.

### Decision 7 — retention: 5,000 rows, prune every 100 writes

Copy `requestcapture`'s constants (`types.go:6-7`), not `eventlog`'s 20,000:
this is a per-cycle record, closer in frequency to a captured request than to
a runtime event. 5,000 rows is ~20h of continuous worst-case foreground
ticking. Drop oldest-first by `reported_at_ms`, inside the insert transaction.

Size ingest **assuming a backing-off client**: mobile is adding backoff to its
outbox retry specifically so an eager client cannot turn our load-shedding
into a hot loop against the contention it sheds for.

**Seed the prune counter from the existing row count at construction**, as
`eventlog/store.go:62` does and `requestcapture` does not. Traffic here is
bursty and session-bound; an unseeded counter never prunes in a session that
writes fewer than 100 rows.

### Storage mechanics — use the existing driver, invent nothing

`internal/persistence/schema.go` already is the generic additive-migration
driver (`TableSchema{Name, CreateDDL, ColumnAdds, Indexes, Migrate}` +
`EnsureTableSchema`). Each bounded context exposes `SchemaTables()`, assembled
in exactly one place: `initializeBridgeDB`,
`internal/sync/sqlite_bootstrap.go:160-164`.

- new `internal/observability/syncdiag/schema.go` exposing `SchemaTables()`,
  mirroring `eventlog/schema.go`
- **one line** added to the composition in `initializeBridgeDB`
- full `CreateDDL` with every column present from day one, so the `Migrate`
  hook is never invoked for this table
- `Indexes`: `cycle_id` (UNIQUE), `trigger_source`, `previous_outcome`,
  `previous_error_fingerprint`, composite `(device_id, reported_at_ms)`.
  **Not** `degraded` (Decision 3)

> **CORRECTED — column names carry a `previous_` prefix.** Earlier revisions of
> this proposal named these indexes `outcome` and `error_fingerprint`, inherited
> from a column list in `explore.md` that was itself wrong. There are no
> current-cycle `outcome`, `last_stage` or `error_*` fields on the wire:
> `toWireSyncCycleTelemetry` (`sync-telemetry.helpers.ts:207-238`) emits six
> top-level keys — `cycle_id`, `trigger_source`, `app_state`, `previous_cycle`,
> `counters`, `recent_events` — and every outcome and error field lives ONLY
> inside `previous_cycle`. That is coherent: the reporting cycle is still running
> when it reports, so it has no outcome yet. A column named `outcome` holding the
> *previous* cycle's outcome would reintroduce exactly the quiet mislabelling
> this change exists to stop. The design document is authoritative on column
> names; it read the serializer, and the earlier phases inferred.

A later widening uses the same `ColumnAdds`/`Migrate` machinery that added
`anime_changed_outbox.changed_fields_json` post-launch
(`internal/sync/schema_tables.go:41-65`).

### Handler shape — strict, and deliberately asymmetric with reconcile

Template is `internal/api/handlers/season_rating_handler.go`: method check →
`authenticate` (nil-safe) → service nil check (`503` if unwired) →
`DisallowUnknownFields()` strict decode into a **bridge-owned contract type**,
never a passthrough of mobile's raw JSON shape → business call → outcome
switch → response.

Reconcile's tolerance of unknown fields is a migration-safety artifact it
cannot escape until mobile cuts over; a brand-new endpoint owns its contract
from day one.

Auth reuses `(*Handler).authenticate` (`internal/api/router_transport.go:34`)
verbatim. The server does **not** verify that a reconcile preceded the POST.

### Ack shape — bare 2xx

One object per cycle; `recent_events` is an array *inside* it, already
coalesced client-side. Per-record ids would describe a plurality that does not
exist. More importantly, **the bare 2xx is the commit point that lets a
durable outbox delete a delivered envelope** — one boolean, durable or not.

### Declare-and-ignore `client_telemetry` — structurally, not by shape

`ReconcileRequest` gains `ClientTelemetry json.RawMessage`: **accepted and
uninterpreted**, never parsed into a typed shape. During dual-write the same
envelope rides both legs, so the reconcile body's copy also carries `degraded`
and will keep gaining any future field. Pinning its shape here would make
every mobile-side addition a bridge-side break on the leg we deliberately do
not validate.

This is safe today because `decodeReconcileRequest`
(`internal/api/handlers/sync_handler.go:91`) does not use
`DisallowUnknownFields()`. **Say so in the code comment**, so a future
tightening does not trip over the one field it must keep tolerating.

### Rollout — dual-write, our call, cut on unmatched ids

Recommended, and it is the bridge's decision, not a mobile constraint (mobile
confirmed it is not awkward on their side): mobile keeps sending
`client_telemetry` on reconcile **and** POSTs the same envelope with the same
`cycle_id`. It costs the bridge nothing extra, because Decision 6 already
handles the same `cycle_id` arriving twice.

Two reasons: during the transition window, a reconcile that succeeds while the
logs POST fails still delivers the envelope via the piggyback; and the shared
`cycle_id` makes the cutover measurable.

**Cutover gate — parity is the alarm, not the target.** Delivery parity fails
in both directions:

- *Before* mobile's outbox lands, dual-write cannot measure recovery. When the
  device is offline the reconcile throws before the POST is attempted, so
  neither leg delivers. That window validates our schema, ingest and
  idempotency — worth doing, but it proves nothing about recovery.
- *After* the outbox lands, the endpoint must deliver **strictly more** than
  the piggyback; recovering the offline cycles the piggyback discarded is the
  entire point. Equal counts would mean the outbox is not working.

So: **cut the piggyback when the endpoint delivers ≥ the piggyback AND is
carrying `cycle_id`s the piggyback never sent.** Unmatched ids are the
positive signal.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/handlers/sync_diagnostics_handler.go` | New | Auth, strict decode, validate, bounded insert, ack |
| `internal/observability/syncdiag/` | New | Contract type, vocabularies, `schema.go` + `SchemaTables()`, store, prune |
| `internal/sync/sqlite_bootstrap.go` | Modified | One line in the `initializeBridgeDB` composition (`:160-164`) |
| `internal/api/router.go` | Modified | Route in `buildHandlerMux`, builder, `Config` field |
| `internal/api/contracts/contracts.go` | Modified | `ClientTelemetry json.RawMessage` on `ReconcileRequest` |
| `docs/openapi.yaml` | Modified | New path; `ReconcileRequest.client_telemetry` (deprecated) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **This change is necessary but not sufficient.** The ack protects the *ring*, which is re-mergeable. It does not protect the *post-mortem*: `previous_cycle` is a snapshot of `sync_runtime_status` (`headless-sync-cycle.helpers.ts:76`) whose source fields are overwritten at `:84` and `:87`. Its loss window changes shape — from "reconcile failed" to "reconcile succeeded, POST failed" — rather than closing | High | Only mobile's durable outbox closes it. External dependency. This change is a prerequisite for that outbox, not a substitute |
| **This endpoint becomes the only bounded path in the system**, and a later reader assumes request handling is solved | High | Recorded defect 2 states the reconcile path stays unbounded, with the three corrections that stop the follow-up being mistaken for a struct-field addition |
| Data is queryable in SQL but not through the MCP the operator actually uses | High | Named, not silently deferred; recommend follow-on `device-sync-diagnostics-read` |
| **The budget is implemented as a response deadline rather than on the DB call.** The endpoint would answer `503` on time while still holding the connection — protecting nothing, and invisibly | Medium | Decision 5 states the `ExecContext` binding as an implementation requirement with the context-aware-pool-wait rationale; the success criterion asserts release, not status |
| **Only half the deferred follow-up is done** — the bridge-side contention is fixed, the phone is still hung | Medium | Recorded defect 2 names two remediations with distinct beneficiaries and states plainly that neither substitutes for the other |
| A future change "improves" the endpoint by making it wait for the connection, reintroducing contention with reconcile | Medium | Never-hold-the-request written as an explicit non-functional requirement with its reasoning (Decision 5) |
| A future tightening adds `DisallowUnknownFields()` or a typed shape to the reconcile `client_telemetry` field, breaking dual-write on every mobile-side addition | Medium | Declared as `json.RawMessage`, accepted-and-uninterpreted, with the reason in the code comment |
| Reject-don't-coerce means a new mobile vocabulary member gets `400` from an un-upgraded bridge | Medium | Same coupling `DisallowUnknownFields()` already imposes: a new value is a coordinated release, exactly like a new field. Vocabularies in one Go constant set |
| Over-tight `NOT NULL` on previous-cycle fields silently rejects valid records | Medium | Decision 4 enumerates exactly one guaranteed field (`outcome`); everything else nullable, with a test per nullable field |
| Shed order changes on the mobile side and `degraded` silently under-reports | Medium | The "lighter pieces are absent" implication depends on a total ordering; that ordering is pinned in the schema comment and named a two-sided contract change, not an implementation detail |
| A future consistency edit adds `DisallowUnknownFields()` to reconcile and 400s every mobile sync | Medium | Declaring the field removes the incentive; code comment names the cutover as the precondition |
| Recorded sanitization drift stays open in `requestcapture` | Medium | Recorded with file:line; separate follow-up recommended. This endpoint does not inherit that precedent |

## Rollback Plan

Revert the commit range. The table is additive and orphaned, not dropped — the
composition line is gone, existing rows are inert, and no read path references
it. Mobile is unaffected: under dual-write it still sends `client_telemetry`
on reconcile, which reverts to being silently dropped exactly as today. No
migration to undo, no wire contract broken.

## Dependencies

- **Mobile's durable telemetry outbox** (with retry backoff). Work mobile needs
  either way — the current design loses data without it — so it is not debt
  this change creates. Required before the piggyback can be retired; the
  bridge ships first and does not block on it.
- **Mobile ships `degraded`** in the same work that adopts the endpoint, so the
  key exists from the very first request to this endpoint — no
  optional-then-required migration. Under dual-write the same envelope rides
  the reconcile leg too, so that copy carries it as well; irrelevant either
  way, since the bridge declares-and-ignores that field and never parses it.

## Review Workload

`auto-chain`, three slices. Each slice is the review unit and each is
comfortably under the 800-line budget; the ~870-line aggregate exceeds it,
which is why it chains rather than ships as one PR.

1. **Storage** (~350): `syncdiag` package, `schema.go`/`SchemaTables()`, DDL
   with nullability, the two id columns and the `degraded` implication
   comment, store with idempotent insert + prune, retention tests. Ships
   alone; table exists and is empty.
2. **Endpoint** (~410): contract type, vocabulary validation, field-naming
   rejection, re-serialization, 2 s bounded insert with shed-on-expiry,
   handler, router wiring, `httptest` contract tests. Ships alone; endpoint
   live and writing.
3. **Contract + docs** (~110): `docs/openapi.yaml`, reconcile
   declare-and-ignore.

## Success Criteria

- [ ] `POST /api/sync/diagnostics` acks `2xx` only after the row is durable;
      `401` unauthenticated, `400` naming the offending field on an unknown
      field or off-vocabulary value, `503` on write-budget expiry.
- [ ] Under a held connection the endpoint **sheds**: a test holds the single
      connection, asserts the `503`, asserts the elapsed bound, and asserts
      the handler released rather than queued — the status code alone does not
      prove shedding.
- [ ] Replaying an identical `cycle_id` returns `2xx` and creates no second
      row.
- [ ] `previous_cycle: null` is accepted; a **missing** `previous_cycle` key is
      rejected; a `previous_cycle` carrying only `outcome` is accepted and
      stored, with a test per independently-nullable field.
- [ ] A degraded payload (`recent_events: []`, `previous_cycle: null`,
      `degraded: 'previous_cycle'`) is accepted and distinguishable from a
      first-run payload (`degraded: null`).
- [ ] `cycle_id`, `trigger_source` and `outcome` answer "did logs arrive in
      the last N cycles?" as an indexed query, with no body inspection.
- [ ] No column can hold a path, SQL fragment, or anime title — proven by a
      test feeding an adversarial payload, including one that smuggles free
      text through `recent_events`.
- [ ] Retention holds the row count at or below cap + one prune cycle under
      sustained writes, including across a simulated process restart.
- [ ] Reconcile behavior is byte-identical before and after; a body carrying
      `client_telemetry` still succeeds.
