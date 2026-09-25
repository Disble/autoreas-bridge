# Design: Diagnostics Kind Store

> `openspec/` is historical evidence, not an active contract. The code and `docs/openapi.yaml` are the
> execution contract; where this file and the code disagree, the code wins and the drift is recorded
> before any correction is planned.

## Technical Approach

`internal/observability/telemetry` owns the envelope, the kind registry, the discriminated store, the
descriptor and the generic reader. The existing `internal/observability/syncdiag` package becomes the
registered `cycle_report` kind implementation — its proven closed-vocabulary suite is an asset to keep,
not to rewrite. What survives every slice is `Validate`, `WireReport`, `FieldError`, `Record`,
`RecentEvent`, `PreviousCycle` and `RetentionLimit()` — live code depends on all of them, and slice 4b
deletes only what existed to serve the legacy table: its DDL, its reader and its store.

The endpoint stays `POST /api/sync/diagnostics` on the same path, and becomes kind-discriminated there:
the discriminator is read first, the registry resolves the kind, and only that kind's own strict decoder
runs. Never a sibling endpoint per kind.

`telemetry.DefaultRegistry()` is the **single vocabulary declaration point**. Every new kind adds itself
there and nowhere else, and the store is built from the same registry the handler dispatches on, so a
kind cannot be servable and unretainable at the same time.

## The Envelope

One table, `device_telemetry_events`, declared through `persistence.TableSchema` and applied by
`EnsureTableSchema`:

| Column | Ownership | Notes |
|---|---|---|
| `device_id TEXT NOT NULL` | envelope | From the bearer token only, never the body |
| `reported_at_ms INTEGER NOT NULL` | envelope | The bridge's receipt clock; retention ordering must not depend on device clocks |
| `kind TEXT NOT NULL` | envelope | The wire discriminator |
| `event_id TEXT NOT NULL` | envelope | The kind-scoped idempotency key |
| `observed_at_ms INTEGER` | envelope | Nullable client event time |
| `degraded TEXT` | envelope | Nullable fidelity signal |
| `payload_json TEXT NOT NULL DEFAULT '{}'` | the kind | Never repeats what a column owns |
| `UNIQUE (kind, event_id)` | envelope | Identity is scoped per kind |

Indexes are only what a query uses: `(kind, reported_at_ms DESC)` for per-kind recency and the prune,
and `(device_id, reported_at_ms DESC)` for the per-device read. The three speculative indexes the legacy
schema carried (`..._trigger_source`, `..._previous_outcome`, `..._previous_error_fingerprint`) are not
carried over: no query in `reader.go` filters or sorts on any of them — `ReportQuery` carries only
`DeviceID` and `Limit` — so they cost write time and bought nothing.

**Querying a payload field without a migration** uses the repo's own idiom: a `VIRTUAL` generated column
plus an index, exactly as `animeSnapshotsNameKeyExpr` does at `internal/sync/schema.go:24-42`. Its
documented lesson carries over — the `json_valid` guard there is load-bearing, because evaluating an
expression over unreadable JSON raises and fails the whole write. **No per-kind columns by default:** a
field is promoted to a queryable projection only when a read surface actually filters or sorts on it.

## Architecture Decisions

### Decision: one kind is one complete declaration, never a minimal one

```go
type Kind interface {
    Name() KindName
    // Decode strict-decodes and validates one request body of this kind.
    // It rejects, never coerces, and its error names the offending field.
    Decode(body []byte) (Validated, error)
    // RetentionLimit is this kind's own row cap.
    RetentionLimit() int
}
```

Each kind declares its strict decoder, its validator, its stored projection request and its retention
budget — complete, not minimal. The store accepts only an already-validated record, and the generic store
never imports a kind implementation.

**Why this shape, independent of the migration rule:** with an unknown number of kinds over the product's
life, a table that grows a column set per kind is the shape that does not scale. It is not a workaround
for a constraint; it is the forward design.

### Decision: per-kind retention, and a kind with no declared cap is refused

Retention is per kind, because a single global cap over heterogeneous write frequencies lets a
high-frequency kind evict a low-frequency one. `cycle_report`'s `RetentionLimit()` returns
`syncdiag.RetentionLimit()`; `episode_action` declares its own cap as its own named constant.

Retention is enforced at **prune** time, never at write time, so raising or lowering a cap later rewrites
no row — it is not a migration. But a kind the store has **no declared cap for** is refused by `Insert`
before any database work, returning `Shed` together with `ErrUndeclaredKind`. The one table whose purpose
is to be bounded must not grow without bound through a wiring bug. Prune runs on a per-process success
counter with cadence `pruneEvery` plus an unconditional prune on the first successful write of the
process; a conflict no-op never advances the counter.

### Decision: the discriminator uses `json.RawMessage`, because absence and `null` are different facts

An absent `kind` is the frozen `cycle_report` default — that is what every already-deployed mobile build
sends, and it must stay byte-identical. An explicit `kind: null` is **not** absence and MUST be refused,
because mobile's own classifier cannot match `undefined` with `null`: folding `null` into the legacy
default would deliver a body that neither side agrees on.

The mechanism is the repo's existing one. `syncdiag.WireReport.Degraded` and `PreviousCycle` are
`json.RawMessage` precisely so an absent key and a present `null` stay different facts, and the probe
reuses it:

```go
// probeKind reads only the discriminator, tolerantly, so the body can be
// dispatched before any kind-specific strict decode runs.
var probe struct {
    Kind json.RawMessage `json:"kind"`
}
```

| Probe outcome | Response |
|---|---|
| the body is not a JSON object (including a literal `null`) | `400`, `body_unreadable` |
| `probe.Kind == nil` (key absent) | `cycle_report` — the frozen legacy default |
| `probe.Kind == []byte("null")` | `400` naming `kind`, `kind_malformed` |
| decodes to a non-string | `400` naming `kind`, `kind_malformed` |
| decodes to a string with no registry entry | `400` naming `kind`, `kind_not_served` |
| decodes to a registered name | that kind's own `Decode` |

Two notes on that table, both of which were found by probing the running endpoint rather than inferred. A
body that is literally `null` decodes into a nil map **without an error**, so without an explicit check it
falls through to the frozen absent-key default and blames a `cycle_report` field the body never declared;
the probe is therefore a `map[string]json.RawMessage` and a nil map is refused as an unreadable body, so
every non-object agrees with every other non-object. `{}` is deliberately **not** folded in with the
non-objects: an empty object genuinely is a `cycle_report` that omitted a required key, so it keeps the
which-field `400` naming that key. Both sides are pinned by tests.

An explicit `kind: "cycle_report"` is accepted and has an identical validation outcome to absence, because
`syncdiag.WireReport` declares an optional `kind` field so the existing `DisallowUnknownFields` decode
does not reject it. **No validation rule, vocabulary, member, shape rule or strict-decode behaviour
changed** to make that work.

**A new kind is never inferable by absence.** The default is spent on `cycle_report`; every new kind must
carry `kind` explicitly.

### Decision: the stored payload is a fixed snake_case contract, and the envelope owns what the envelope owns

`payload_json` carries only what the envelope columns do not already own.

For `cycle_report` that means `syncdiag.Record` marshals with explicit snake_case tags and `json:"-"` on
`DeviceID`, `ReportedAtMS` and `Degraded` — the three fields whose authority is a column. A nil
`PreviousCycle` marshals as an explicit `null`, an empty `RecentEvents` as `[]`, never `null`, and no
field carries `omitempty`. `telemetry/cycle_report.go` is the only place in the repo that marshals
`Record`, so the contract is isolated.

For `episode_action` the payload is a fixed seven-key shape — `action`, `phase`, `correlation_id`,
`outcome`, `reason`, `cause`, `duration_ms` — always all present with `null` where the phase carries no
value, and never repeating `kind`, `observation_id` or `observed_at_ms`, which the columns own. A stable
key set rather than omitted keys, so a later reader can query it without first establishing which keys a
phase happens to carry.

**This is a stored contract, so it is fixed now**, and that is the whole reason it is stated this
carefully: changing it later would mean reshaping rows, which the lifecycle rule forbids. The first
version was wrong in exactly this way — Go field names at the top level and inside `PreviousCycle`, plus
`DeviceID: ""` and `ReportedAtMS: 0` duplicating column authority — and was corrected before it shipped.

### Decision: the write budget bounds the database call, never the response

The store owns the deadline: `context.WithTimeout(ctx, WriteBudget)` around the single `ExecContext`, and
a `context.DeadlineExceeded` returns `Shed` wrapping `ErrWriteBudget`. A response deadline would answer
`503` on time while the goroutine kept running and kept holding the single shared connection — protecting
nothing, and invisibly.

`INSERT ... ON CONFLICT(kind, event_id) DO NOTHING` with `RowsAffected() != 1` meaning `Duplicate` rather
than an error, so a blind retry stays correct. `Duplicate` stays indistinguishable from `Stored` on the
wire. A nil `db` returns `Shed` with an error.

### Decision: the refusal vocabulary grows; a status code per case does not

Every refusal this operation emits carries a `code` from `SyncDiagnosticsRefusalCode`, a closed vocabulary
that grows. `kind_not_served` is the **only** recoverable member.

| Code | Status | Meaning |
|---|---|---|
| `kind_not_served` | `400` | The body is well formed and names a kind this build does not declare. The one RECOVERABLE refusal |
| `kind_malformed` | `400` | The discriminator is present but is a `null` or a non-string. Permanent |
| `body_unreadable` | `400` | Not a JSON object, not JSON at all, or a key the selected kind does not declare. Permanent |
| `field_rejected` | `400` | A named field carried an off-vocabulary or out-of-shape value. Permanent |
| `body_too_large` | `413` | Over the 8 KiB cap |
| `ingest_unavailable` | `503` | No seam wired |
| `write_budget_exceeded` | `503` | The single shared connection was held past the write budget |
| `internal_error` | `500` | Any other failure, including `ErrUndeclaredKind` |
| `method_not_allowed` | `405` | Wrong verb |

**Rejected:** a per-case status code, or a single per-case boolean. A boolean expresses one fact, so the
second refusal class needs a second key — the client ends up enumerating flags and every new class is a
response-shape change. A status per class spends the status space on something that belongs in the body:
it cannot separate the two `400`s that matter without splitting one status into many, and a client's
permanence policy then depends on an HTTP table rather than on a value. One vocabulary absorbs every
future class with no new key and no new status.

`field` is present only when a field was named and rejected: `field` present means validation named the
offender, `field` absent means the refusal was never about a field. The `401` is the one refusal this
operation does not write itself — it comes from the shared authentication layer — so it carries no `code`.

**Version coupling is not solvable by release ordering.** A client pointed at a user-controlled
counterpart cannot be protected by ordering a deploy: a `400` with no `code` is a statement about which
build answered, not about the bytes. That is why the client rule is per row — **no code means park** —
rather than per release. `kind_not_served` therefore never shares the status a client reads as "these
bytes will never be accepted".

### Decision: the response contract keeps its shape

| Cause | Response |
|---|---|
| `*syncdiag.FieldError` (any kind that reuses it) | `400 {error, field}` + code |
| decode failure, unknown kind, missing discriminator parse | `400` (with `{error, field}` naming `kind` where the discriminator is the cause) + code |
| `telemetry.ErrWriteBudget` | `503` + `Retry-After: 5` + code |
| `telemetry.ErrUndeclaredKind` | `500` — a wiring bug, never a retryable shed |
| any other error | `500` |
| `Stored`, `Duplicate` | `204` |

A shed is **never** `204`: the client's ring drain is destructive and gated on a `2xx`, so "not stored"
must never be indistinguishable from "stored".

## The Lifecycle Boundary, And Its Guard

The declarative driver (`internal/persistence/schema.go`) may create tables and add columns. It MUST
NEVER reshape, move, drop or reinterpret a row that already exists. A historical rewrite, if ever
genuinely needed, is a **deliberately-invoked one-off** — a script invoked by a person once, wired into
nothing, and deleted after use.

The rule is scoped to **historical data only**. It is not a limit on the future and not a reason to
under-design: the fresh DDL must be complete for every kind we know, forward evolution through the
declarative driver is ordinary work, and a new kind must arrive as one complete registry declaration.

| Category | In lifecycle | Why |
|---|---|---|
| Create a new table | Allowed | Every table in this repo is born this way (`EnsureTableSchema`); no existing row is touched |
| The fresh DDL being complete | Required | Designing a partial schema out of caution about `ALTER` is under-design, not caution |
| Forward schema evolution for a projection | Allowed | Ordinary evolution through the declarative driver; no row rewrite |
| A kind arriving as one complete declaration | Required | Decoder, validator, projection and retention together |
| Rewrite, move, rename or reinterpret existing rows | **Forbidden** | The pattern this design refuses |

**Evidence of the pattern being refused**, kept out of scope but recorded:
`internal/sync/sqlite_bootstrap.go` (`ensureRequestCaptureTableRename`) and the seven live `Migrate:`
hooks under `internal/sync/schema_tables.go`, `internal/download/dbschema/schema.go` and
`internal/season/schema.go`.

**The machine owner is a guard test, in two halves:**

1. **Shipped.** The declared `TableSchema` for `device_telemetry_events` has a nil `Migrate` and an empty
   `ColumnAdds`, asserted — the rule needs a machine owner, so the descriptor cannot gain a hook quietly.
2. **Owed by slice 4b.** Boot the schema driver over a database holding legacy `device_sync_diagnostics`
   rows and assert every row is byte-identical afterwards, the table still exists, and no `Migrate` or
   `ColumnAdds` hook ran. This is the only thing that would catch a future slice reintroducing a rewrite.

**The legacy table is retired from the lifecycle but never dropped.** `syncdiag.SchemaTables()` leaves
`internal/sync/sqlite_bootstrap.go`, so `device_sync_diagnostics` is never created again; existing
installs keep the table and its rows, and nothing drops them and nothing reads them. Slice 4a deliberately
left it registered so that the read repoint stayed independently reviewable and revertible.

## Data Flow

    POST /api/sync/diagnostics
      │
      ├─ method check ───────────────── 405 + method_not_allowed
      ├─ authenticate() ─────────────── 401 (no code; not written by this handler)
      ├─ seam nil-check ─────────────── 503 + ingest_unavailable
      ├─ MaxBytesReader(8 KiB) ──────── 413 + body_too_large
      ├─ probe the discriminator ────── 400 kind_malformed | kind_not_served | body_unreadable
      ├─ the kind's own Decode ──────── 400 field_rejected (+ field) | body_unreadable
      └─ Ingest(ctx, telemetry.Event)
           └─ Store.Insert   ctx+2s → ExecContext
                ├─ rows=1 → Stored ────────── 204
                ├─ rows=0 → Duplicate ─────── 204   (ON CONFLICT DO NOTHING)
                ├─ ErrWriteBudget ─────────── 503 + Retry-After: 5 + write_budget_exceeded
                ├─ ErrUndeclaredKind ──────── 500 + internal_error
                └─ other ──────────────────── 500 + internal_error
                (rows=1 → counter++ → prune every pruneEvery, plus the first write; errors swallowed)

Reads are two layers, so the generic reader stays kind-agnostic:

1. `telemetry/reader.go` — the envelope read. `NewReader(db)` probes the table once (`Available()`);
   `List(ctx, ReportQuery)` returns newest-first, page-bounded rows. An empty `DeviceID` applies no device
   predicate; a zero or negative `Limit` means the package default clamped to the package maximum,
   enforced in SQL rather than by post-query truncation. A **missing table is not an error**: `Available()`
   reports false and every query returns an unavailable envelope, so a database predating the table
   degrades instead of failing the whole read.
2. `telemetry/cycle_report_read.go` — the kind's own projection, including the three fields that used to
   be columns and now live inside the stored `previous_cycle` object. A payload that does not unmarshal is
   a **corrupt row, not a crash**: it degrades to absent nullable fields.

## Testing Strategy (strict TDD — RED before each production change)

The stored payload is asserted against a **literal golden**, never against a re-marshal of the same
struct: an equality between two marshals of one struct passes under any tag change and can never catch the
regression it exists to catch. The golden was proven to fail when a single `json:"-"` tag is removed.

| Unit | RED tests the record states |
|---|---|
| Slice 1 — store and registry | An unregistered kind name misses the lookup; a registered kind dispatches by name; `cycle_report` decodes a body with no `kind`; an explicit `kind: "cycle_report"` alias validates identically; the same `event_id` under two kinds stores two rows; the same `(kind, event_id)` twice stores one row and reports `Duplicate`; pruning keeps the newest N within a kind and never evicts another kind's rows; pruning runs on the first successful write of the process; a held connection sheds within the budget and a shed is never reported as stored; the declared `TableSchema` has a nil `Migrate` and an empty `ColumnAdds`; `payload_json` is re-serialized from validated values, never copied from the client's raw bytes |
| Slices 2–3 — endpoint | An absent `kind` still decodes and stores as `cycle_report`, asserted through the handler; an explicit `kind: null` is refused naming `kind` and stores nothing; a non-string `kind` is refused; an unknown well-formed `kind` is refused and stores nothing; a registered kind dispatches to its own validator and stores under its own name; `ErrUndeclaredKind` maps to `500`, not `503`; `ErrWriteBudget` still maps to `503` with `Retry-After: 5` and never to `204`; `Stored` and `Duplicate` both ack `204`; an oversize body still reports `413` before any decode; `DefaultRegistry()` contains `cycle_report` |
| `episode_action` | A valid body for each of the four phases decodes and stores, with `EventID` equal to `observation_id`; each vocabulary rejects an off-list member naming its own field; the cross-field rule refuses `finished`+`ok` and `sync`+`committed`; `outcome` present on `received`/`skipped` or absent on `finished`/`sync` is refused; `reason` outside `skipped`, and absent on `skipped`, is refused; `cause` on `finished`+`committed`, absent on `finished`+`failed`, and on any other phase is refused; `duration_ms` non-null off `finished` and null on `finished` is refused, as is an absent key; an undeclared key anywhere, including a body-supplied `device_id`, is refused; a negative `observed_at_ms` and empty ids are refused; the stored payload is the fixed seven-key shape asserted against a literal; `DefaultRegistry()` resolves both kinds, each with its own cap; end to end, a reposted `observation_id` acks `204` without a second row |
| Slice 4a — read side | A stored cycle report reads back through the new reader into the desktop DTO with every field intact, including the three that moved into `previous_cycle`, and an explicitly null `previous_cycle` mapping to absent fields; the reader is kind-scoped, so an `episode_action` row never appears in a cycle-report read; a device predicate restricts the page and an empty one does not; the limit is clamped in SQL; a missing table reports unavailable rather than erroring; a row whose payload does not unmarshal degrades instead of panicking; newest-first ordering |
| Slice 4b — the guard | Apply the full table set over a database holding legacy `device_sync_diagnostics` rows and assert every row is byte-identical afterwards, the table still exists, and no `Migrate` or `ColumnAdds` hook ran. **Not written yet.** |

MUTATION follows GREEN on the owning package
(`ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json <pkg>/"`).
A survivor is analysed and recorded as equivalent or unpinnable; no threshold is weakened and no survivor
is suppressed. Two `episode_action` mutants (its retention literal ±1) are left alive on purpose, because
killing them means asserting a production constant — the anti-pattern this repository forbids. One
`store.go` survivor (`pruneErr != nil`) is accepted because its only observable effect is a `log.Printf`.

## Migration / Rollout

Additive only, and strictly forward. The table is born through `EnsureTableSchema` with a complete DDL, no
`Migrate` hook and no `ColumnAdds`. Existing `device_sync_diagnostics` rows are neither read nor written
nor reshaped. Rollback is a revert of the commit range: the new table is left inert rather than dropped,
and the endpoint's contract for a body naming no kind is unchanged.

## Open Items

- **Slice 4b**, the legacy table's retirement and the behavioural guard above. Not complete.
- **The reshape script**, only if the owner wants the history: a deliberately-invoked one-off. The record's
  default is to leave the old rows in place, unread, and write no script, because the data is internal and
  not in backups.
- **Folding in `request_captures` and log-sync**: a separate work unit. `request_captures` backs the
  user-visible Activity UI and already carries a lifecycle `Migrate` hook.
- **The layering inversion**: `telemetry` imports a specific kind's package for `*syncdiag.FieldError`. The
  clean end state needs the `cycle_report` kind moved out of `telemetry` first.
- **A RED guard for the comment above `validateRecentEvents`** and its uncovered `400`-on-unknown-key
  inside a `recent_events` element, found by mobile: a comment and test gap, not a behaviour change.
