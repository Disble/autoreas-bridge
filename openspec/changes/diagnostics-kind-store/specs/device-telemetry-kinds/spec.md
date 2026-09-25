# Device Telemetry Kinds Specification

> **This document is historical evidence, not an active contract.** In this repository `openspec/` is
> evidence of what was decided and when; the execution contract is the code plus the current product
> documentation (`docs/openapi.yaml` for the wire surface). When this file and the code disagree, the code
> wins as runtime truth, and the drift is recorded before any correction is planned. Every slice of this
> change is implemented, including the retirement of the legacy table from the schema registry, and no
> `verify-report.md` exists: the gate ran per slice and `odd/tasks/diagnostics-kind-store.md` carries each
> slice's evidence.

## Purpose

Defines the telemetry store behind `POST /api/sync/diagnostics`: one table discriminated by `kind`, the
shared envelope, per-kind identity and retention, the stored-payload contract, the refusal vocabulary, and
the lifecycle boundary the schema driver may not cross. Diagnostics, logs and telemetry are one domain;
the number of kinds is unknown and grows for the life of the product.

## Requirements

### Requirement: One Store Discriminated By `kind`, Never A Table Per Kind

The system MUST store every telemetry kind in one table, `device_telemetry_events`, discriminated by a
`kind` column. A kind MUST NOT get its own table, and MUST NOT get its own endpoint: the delivery path
stays `POST /api/sync/diagnostics` for every kind.

The shared envelope MUST be owned by every kind alike:

| Column | Ownership | Rule |
|---|---|---|
| `device_id` | envelope | From the authenticated bearer token ONLY; a body-supplied `device_id` MUST be refused |
| `reported_at_ms` | envelope | The bridge's receipt clock; retention ordering MUST NOT depend on device clocks |
| `kind` | envelope | The wire discriminator |
| `event_id` | envelope | The kind-scoped idempotency key |
| `observed_at_ms` | envelope | Nullable client event time |
| `degraded` | envelope | Nullable fidelity signal; a kind with no fidelity signal leaves it null |
| `payload_json` | the kind | MUST NOT repeat what a column already owns |

A kind MUST be **one complete declaration** — a strict decoder, a validator, a stored projection and its
own retention cap — and MUST be registered in exactly one place, `telemetry.DefaultRegistry()`, which MUST
be the same registry the store is built from, so a kind cannot be servable and unretainable at once.

The store MUST accept only an already-validated record. The generic store MUST NOT import a kind's
implementation. No per-kind column MUST be added by default: a payload field is promoted to a queryable
projection only when a read surface actually filters or sorts on it, and when it is, it MUST be added
forward through the declarative driver as a `VIRTUAL` generated column plus an index, never by rewriting a
row.

The descriptor MUST declare a complete fresh DDL, and MUST carry no `Migrate` hook and no `ColumnAdds`.

#### Scenario: A second kind arrives as a registry entry and nothing else
- GIVEN a kind that declares a strict decoder, a validator, its stored projection and its retention cap
- WHEN it is registered in `telemetry.DefaultRegistry()`
- THEN it is reachable on the existing path, and no table, column, index or migration is added
- AND the store built from that registry retains it

#### Scenario: The store never holds an unvalidated record
- GIVEN one kind's validator rejects a body
- WHEN the refusal is returned
- THEN nothing is written, and the store is never asked to accept raw request bytes

### Requirement: The Discriminator — An Absent `kind` Is The Frozen Default, An Explicit `null` Is Refused

The discriminator MUST be read tolerantly, before any kind-specific strict decode, and absence MUST be
distinguishable from an explicit `null`. This is a mechanism requirement, not a style one: a pointer
field collapses "key absent" and "key present, value null" into the same nil, which destroys exactly the
distinction this rule is built on.

- A **key absent** MUST decode as `cycle_report`, byte-identically to the behaviour that shipped before the
  store was discriminated, because every already-deployed mobile build sends no `kind` at all.
- An **explicit `kind: null`** MUST be refused with `400` naming `kind`. Folding it into the legacy default
  would deliver a body neither side agrees on: the client's own classifier cannot match `undefined` with
  `null`.
- A **non-string** `kind` MUST be refused with `400` naming `kind`.
- A **well-formed but unregistered** name MUST be refused with `400` naming `kind`, carrying the
  `kind_not_served` code, and MUST store nothing.
- An explicit `kind: "cycle_report"` MUST be accepted with a validation outcome identical to absence.
- A body that is **not a JSON object** — including a literal `null`, an array, a string, a number or a
  boolean — MUST be refused as unreadable. All non-objects MUST be refused uniformly.
- An **empty object** MUST NOT be folded in with the non-objects: it is a `cycle_report` that omitted a
  required key, so it keeps the which-field `400` naming the required key it is missing.

The kind vocabulary MUST be closed and MUST grow by declaration only. **A new kind MUST be reachable only
by naming it: no kind MUST ever be inferable from absence.** The absent-key default is spent on
`cycle_report`.

#### Scenario: A deployed client that names no kind is unaffected
- GIVEN a request body with no `kind` key, of the shape already-deployed mobile sends
- WHEN the handler processes it
- THEN it is stored as a `cycle_report`, with the same validation outcome and the same response as before
  the store was discriminated

#### Scenario: An explicit null is not absence
- GIVEN a well-formed body whose `kind` is explicitly `null`
- WHEN the handler processes it
- THEN the bridge returns `400` naming `kind` and stores nothing
- AND the same body with the `kind` key removed instead stores as a `cycle_report`

#### Scenario: An unregistered kind is refused, not defaulted
- GIVEN a body naming a kind that no build declares, and the name stays unregistered
- WHEN the handler processes it
- THEN the bridge returns `400` naming `kind` with the `kind_not_served` code and stores nothing
- AND the refusal MUST NOT be treated as a `cycle_report`, and MUST NOT be accepted by falling back to the
  absent-key default

#### Scenario: Every non-object body is refused the same way
- GIVEN bodies that are a literal `null`, `[1,2,3]`, a string, a number and a boolean
- WHEN each is processed
- THEN each is refused as an unreadable body
- AND a body that is `{}` is refused instead as a `cycle_report` naming its first missing required key

### Requirement: A Kind's Vocabularies Are Closed And Reject Rather Than Coerce

Every enumerated field of a kind MUST be validated against that kind's OWN closed vocabulary, and an
off-list value MUST be refused with `400` naming the field — never coerced to a fallback member, and never
silently dropped.

A vocabulary MUST be distinctly named for the field it gates, even when another vocabulary happens to share
members. Collapsing two sets that share a member would make one field's membership independent of the
context it belongs to, and would accept combinations the kind's rules exist to refuse.

For the `episode_action` kind specifically:

- `outcome` MUST be one cross-field rule evaluated against `phase`, not two independent membership tests.
  `finished` admits only `committed` or `failed`; `sync` admits only `ok` or `failed`. `finished`+`ok` and
  `sync`+`committed` MUST be refused naming `outcome`, because each value is a legitimate member of the
  other phase's set.
- `outcome` MUST be absent on `received` and `skipped`, and present on `finished` and `sync`.
- `reason` MUST be present on `skipped` and absent on every other phase.
- `cause` MUST be present on `finished` with `outcome: failed` and absent otherwise, including on
  `finished` with `outcome: committed`, where a cause would describe a failure that did not happen. Its
  members MUST match `previous_cycle.error_cause` while remaining an independently declared vocabulary.
- `duration_ms` MUST be present as its own key on every payload; non-null on `finished`, and an explicit
  `null` on `received`, `skipped` and `sync`, never `0`, so a reader cannot mistake "this phase has no
  duration" for an instantaneous measurement. An absent key MUST be refused everywhere.
- `observed_at_ms` MUST be a non-negative integer: a negative epoch millisecond is not a time.
  `observation_id` and `correlation_id` MUST be required non-empty strings.
- An undeclared key anywhere MUST be refused, including a body-supplied `device_id`.

#### Scenario: An off-list member is rejected, not rewritten
- GIVEN a body whose enumerated field carries a value outside that field's own vocabulary
- WHEN the handler validates it
- THEN the bridge returns `400` naming the offending field, and stores nothing
- AND the value MUST NOT be rewritten to a member of the vocabulary

#### Scenario: Two outcome sets that share a member stay two sets
- GIVEN a `finished` payload with `outcome: ok`, and a `sync` payload with `outcome: committed`
- WHEN each is validated
- THEN each is refused with `400` naming `outcome`

#### Scenario: A gate is enforced as absence, not as a null to interpret
- GIVEN a `received` payload carrying `outcome`, and a `skipped` payload missing `reason`
- WHEN each is validated
- THEN each is refused naming the field that must be absent or was missing

#### Scenario: A body-supplied device_id is refused
- GIVEN a body declaring `device_id`
- WHEN it is decoded strictly
- THEN it is refused as an undeclared field, and the stored device id is the token's

### Requirement: Identity Is Scoped Per Kind Under `UNIQUE (kind, event_id)`

The stored uniqueness MUST be `UNIQUE (kind, event_id)`. A `cycle_report`'s key and an `episode_action`'s
key MUST NOT share one uniqueness namespace: two kinds whose keys are the same string MUST store two rows.

Re-posting the same `(kind, event_id)` MUST be a no-op that still acks `204` and creates no second row, and
`Duplicate` MUST remain indistinguishable from `Stored` on the wire, so a blind retry stays correct. A
conflict no-op MUST NOT advance the retention prune counter.

For the `episode_action` kind, `event_id` MUST be the wire `observation_id` verbatim; `observation_id` names
the event, `correlation_id` names the user action it belongs to, and two events of one action share the
latter and never the former.

#### Scenario: The same key string under two kinds stores two rows
- GIVEN two valid bodies of different kinds whose `event_id` is the same string
- WHEN both are stored
- THEN both rows exist, one per kind

#### Scenario: A repost acks without duplicating
- GIVEN a row for a given `(kind, event_id)` already exists
- WHEN the same body is posted again
- THEN the bridge acks `204`, and exactly one row exists for that pair

### Requirement: The Stored Payload Is A Snake-Case Contract The Envelope Does Not Duplicate

`payload_json` MUST carry only what the envelope columns do not already own, and MUST NOT store a
zero-valued duplicate of a field whose authority is a column. Which fields those are is per kind: for
`cycle_report`, `DeviceID`, `ReportedAtMS` and `Degraded` MUST NOT appear, because those three columns own
them; for `episode_action`, the payload MUST NOT repeat `kind`, `observation_id` or `observed_at_ms`.

The payload MUST be snake_case, and it MUST be re-serialized from validated values, never copied from the
client's raw bytes — a client's unvalidated keys MUST NOT reach storage through it.

An absent key and an explicit `null` MUST stay different facts in the stored payload. A kind MAY fix
explicit `null`s and empty collections in place of omitted keys so a later reader can query the payload
without first establishing which keys exist.

**The payload is a STORED contract.** It is fixed when it is first written: changing it later means
reshaping rows, which the lifecycle requirement forbids. A test pinning it MUST assert against a literal
expected payload, never against a re-marshal of the same struct — an equality between two marshals of one
struct passes under any tag change and can never catch the regression it exists to catch.

#### Scenario: The payload does not duplicate column authority
- GIVEN a stored `cycle_report` row
- WHEN its `payload_json` is inspected
- THEN it contains no device id, no receipt clock and no fidelity signal, and carries no zero-valued
  duplicate of a column

#### Scenario: A newer kind does not repeat what its envelope owns
- GIVEN a stored `episode_action` payload
- WHEN it is inspected
- THEN it carries neither the kind, nor the observation id, nor the observed time

#### Scenario: The payload shape is pinned by a test that can fail
- GIVEN the stored payload's literal golden
- WHEN a single field's serialization tag is removed
- THEN the payload test fails and shows the offending key appearing in the stored bytes

#### Scenario: A phase with no value stores an explicit null
- GIVEN a stored `episode_action` payload for a phase that carries no outcome, reason or cause
- WHEN it is read back
- THEN all seven keys are present, with explicit `null` where that phase has no value
- AND the payload repeats neither the kind, nor the observation id, nor the observed time

### Requirement: Retention Is Per Kind, And A Kind With No Declared Cap Is Refused

Retention MUST be enforced per kind. A single global cap over heterogeneous write frequencies would let a
high-frequency kind evict a low-frequency one, so each kind MUST declare its own row cap.

A kind for which the store has no declared cap MUST be refused before any database work, and the refusal
MUST be reported as a non-retryable failure — a wiring bug MUST NOT become a permanent retry loop. The one
table whose purpose is to be bounded MUST NOT be able to grow without bound through a wiring bug.

Retention MUST be enforced at prune time, never at write time. Changing a kind's cap later is therefore NOT
a migration: it rewrites no row. Pruning MUST keep the newest N rows within a kind and MUST NOT evict
another kind's rows, and it MUST run on the first successful write of the process as well as at its
configured cadence.

#### Scenario: Pruning a high-frequency kind leaves a low-frequency kind intact
- GIVEN a kind at its cap and another kind with far fewer rows
- WHEN the first kind's prune runs
- THEN the first kind keeps its newest N rows, and no row of the second kind is removed

#### Scenario: An undeclared cap refuses instead of storing
- GIVEN a kind the store has no declared retention cap for
- WHEN an insert is attempted
- THEN it is refused before any database work, nothing is stored, and the outcome is not a retryable shed

#### Scenario: Raising a cap rewrites no row
- GIVEN a kind whose declared cap is lowered or raised
- WHEN its retention is next enforced
- THEN rows are pruned or kept by the new cap, and no existing row is reshaped

### Requirement: The Write Budget Bounds The Database Call, And A Shed Is Never `204`

The insert MUST run under a bounded deadline of 2 seconds, scoped to the database call only, never to the
response. Preempting SQLite's own 5000 ms `busy_timeout` at 2 seconds MUST be treated as deliberate
per-route policy rather than as an accidental shortening: this is the lowest-value traffic in the system,
so it yields rather than competes, and under a single shared connection the dominant wait is the connection
pool's anyway. A response deadline answers the client while the goroutine keeps running and keeps holding
the single shared connection — protecting nothing, and invisibly.

On expiry the operation MUST shed immediately, without waiting further for the connection, with a `503`
carrying `Retry-After: 5`. **A shed MUST NEVER be `204`.** "Not stored" MUST never be indistinguishable
from "stored", because the client's sync-ring drain is destructive and gated on a `2xx`.

The budget MUST be treated as load-bearing rather than as tuning: the client's own timeout is suspended in
the background task this endpoint exists for, so the bridge's deadline is the only exit, and answering
sooner is strictly better than waiting longer.

#### Scenario: Expiry sheds and stores nothing
- GIVEN the single shared database connection is held by another writer past the budget
- WHEN a telemetry POST arrives
- THEN the bridge returns `503` with `Retry-After`, and never `204`
- AND no row is stored for that shed request

#### Scenario: A shed is never acknowledged as durable
- GIVEN any shed outcome
- WHEN the client reads the response
- THEN the response MUST NOT be a `2xx`, so the client's destructive drain cannot treat an unstored row as
  delivered

### Requirement: Every Refusal Carries A Code From A Growing Vocabulary

Every refusal this operation emits MUST carry a machine-readable `code` from a closed vocabulary that
grows. A new refusal class MUST be a new member, and MUST NOT be a new status code and MUST NOT be a new
per-case key: a per-case boolean expresses exactly one fact, so a second class would need a second key, and
a status per class spends the status space on something that belongs in the body.

The vocabulary grew to separate two `400`s that must not be confused:

| Code | Raised when |
|---|---|
| `kind_not_served` | The body is well formed and names a kind this build does not declare |
| `kind_malformed` | The discriminator is present but is a `null` or a non-string |
| `body_unreadable` | Not a JSON object, not JSON at all, or a key the selected kind does not declare |
| `field_rejected` | A named field carried an off-vocabulary or out-of-shape value |
| `body_too_large` | The body exceeds the size cap |
| `ingest_unavailable` | Ingestion is not wired |
| `write_budget_exceeded` | The database call exceeded the write budget |
| `internal_error` | Any other failure, including an undeclared kind's cap |
| `method_not_allowed` | The verb is not `POST` |

**`kind_not_served` MUST be the ONLY recoverable member.** Its bytes are not wrong — this build simply does
not serve them — so a forward roll recovers every row the client kept. Every other member is permanent, and
a client MAY discard the row.

`field` MUST be present only when a field was named and rejected. The `401` is the one refusal this
operation does not write itself, because it comes from the shared authentication layer, so it carries no
`code`; that MUST be stated rather than left to be discovered. A `401` MUST also store nothing.

**No code means park.** A client MUST decide a row's fate per row, not per release: version coupling is not
solvable by release ordering, because a client can be pointed at a counterpart the user controls, and a
`400` with no `code` is a statement about which build answered rather than about the bytes. Ordering a
deploy protects nothing when the deployed build is not the one that answers.

#### Scenario: A recoverable refusal is not confused with a permanent one
- GIVEN a client that already sends a kind, and a bridge build that predates it
- WHEN that build answers with a `400` and no `code`
- THEN the client parks the row rather than discarding it, because the refusal is not a statement that the
  bytes are unacceptable

#### Scenario: A new refusal class adds a member only
- GIVEN a refusal class the bridge did not previously distinguish
- WHEN it is introduced
- THEN it appears as a new member of the vocabulary, with no new status code and no new per-case key
- AND a client that ignores the code behaves exactly as it did before

#### Scenario: The named offender survives into the response
- GIVEN a body whose field was rejected
- WHEN the refusal is written
- THEN the response carries the code and the field name, and `field` is omitted rather than empty when no
  field was named

### Requirement: The Lifecycle Never Reshapes A Row

The schema driver MAY create tables and MAY add columns. It MUST NEVER reshape, move, rename, drop or
reinterpret a row that already exists — not at startup, not on install, and not on run. This is the
owner's rule and it is absolute.

**The rule is scoped to historical data only.** It MUST NOT be read as a limit on the future or as a
reason to under-design: the fresh DDL MUST be complete for every kind the project knows, forward evolution
through the declarative driver is ordinary work, and a new kind MUST arrive as one complete declaration.

If a historical rewrite is ever genuinely needed it MUST be a **deliberately-invoked one-off** — invoked by
a person once, wired into nothing, and deleted after use — and it MUST NOT be wired into the Bridge
lifecycle. The default recorded by the owner is to leave historical rows in place, unread, and write no
such script at all, because this data is internal and not in backups, so its preservation never drives a
design decision.

A guard test MUST be the machine owner of this requirement, in two halves: the declared table descriptor
MUST be asserted to carry no `Migrate` hook and no `ColumnAdds`, and applying the full table set over a
database holding legacy `device_sync_diagnostics` rows MUST leave every row byte-identical, with the table
still present and no `Migrate` or `ColumnAdds` hook run. At the time of writing the second half was not yet
written.

The legacy table MUST be retired from the lifecycle but MUST NEVER be dropped. Its rows MUST stay untouched
and unread, and no read path MUST reference it.

#### Scenario: Applying the full table set leaves legacy rows byte-identical
- GIVEN a database holding legacy `device_sync_diagnostics` rows
- WHEN the full table set is applied
- THEN every legacy row is byte-identical afterwards, the table still exists, and no `Migrate` or
  `ColumnAdds` hook ran

#### Scenario: A descriptor may not grow a rewrite hook quietly
- GIVEN the declared descriptor for the telemetry table
- WHEN it is inspected
- THEN it declares no `Migrate` hook and no `ColumnAdds`

#### Scenario: The retired table is never dropped
- GIVEN an existing install whose database holds `device_sync_diagnostics`
- WHEN the table leaves the schema registry
- THEN the table and its rows still exist, and nothing reads them

### Requirement: The Read Side Reads The Store The Write Side Fills

The generic reader MUST read the discriminated store, and MUST stay kind-agnostic: the envelope read MUST
be one layer, and a kind's own projection MUST be another, so adding a kind adds no reader.

The reader MUST apply a device predicate only when a device is given, MUST clamp its page limit in SQL
rather than by post-query truncation, and MUST return newest-first. A **missing table MUST NOT be an
error**: the read MUST report itself unavailable so a database predating the table degrades instead of
failing. A row whose stored payload does not unmarshal MUST degrade to absent fields, never panic, and it
MUST be treated as a corrupt row rather than as a reason to fail the read.

A kind-scoped read MUST NOT return another kind's rows.

#### Scenario: A row of another kind never appears in a kind-scoped read
- GIVEN an `episode_action` row and a `cycle_report` row in the same table
- WHEN a cycle-report read runs
- THEN only the `cycle_report` row is returned

#### Scenario: A missing table degrades the read instead of failing it
- GIVEN a database that predates the telemetry table
- WHEN a read runs
- THEN the reader reports itself unavailable, and does not error the whole read

#### Scenario: A corrupt payload degrades
- GIVEN a row whose `payload_json` does not unmarshal
- WHEN it is projected
- THEN its unreadable fields are reported absent, and the read does not panic
