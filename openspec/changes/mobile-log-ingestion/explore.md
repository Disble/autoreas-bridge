# Exploration — Mobile Log Ingestion

Change: `mobile-log-ingestion`
Date: 2026-09-08
Phase: explore (investigation only, no implementation)
Scope: **autoreas-bridge only.** autoreas-mobile adopts separately.

## Goal

Define the correct way to pass diagnostic/log data from autoreas-mobile to
autoreas-bridge. The decision to build a dedicated endpoint is made; this
exploration covers the *how*.

## Why this change exists

Not cost, not bandwidth, not auth surface. **Fitness for purpose.**

A plain question — "did logs arrive in the last reconciles?" — could not be
answered with the current arrangement. Answering it required dumping raw
request bodies through the request MCP, guessing which field carried the logs,
and the sample then produced a *wrong* inferred pattern (a per-cycle sampling
policy was inferred; the real cause was foreground-vs-background call sites plus
a broken React Native headless background task).

The mobile design doc names the cause itself, in its own "Bridge-side work still
pending" section:

> Today the field lands raw inside `request_body`, which is readable but not
> queryable. `search_requests` filters are fixed.

The design was known-incomplete on exactly the axis that failed, and the
incomplete half is the half that makes it usable.

**The prior arrangement was not laziness.** `autoreas-mobile/docs/mobile-diagnostic-telemetry.md`
(status "implemented, 2026-09-04", mirrored in that repo's `ARCHITECTURE.md:396-410`)
records that a separate endpoint "has the same failure mode the telemetry is
meant to eliminate — telemetry about a dying job, sent as an independent
request, can fail independently", measured across five cycles that reached the
bridge and hung afterwards. That decision was deliberate and measured. It was
also incomplete.

## Spec/code drift, recorded first

`CLAUDE.md` rule #2 requires recording drift before proposing fixes.

### Drift 1 — `client_telemetry` is live on the wire and absent from every artifact

`ReconcileRequest` (`internal/api/contracts/contracts.go:270`) has exactly
`DeviceID`, `LastChangelogID`, `PendingOperations`. `decodeReconcileRequest`
(`internal/api/handlers/sync_handler.go:91`) decodes with a plain
`json.NewDecoder(r.Body).Decode(&req)` — no `DisallowUnknownFields()` — so the
field is silently dropped. It appears in no Go type, no spec, and not in
`docs/openapi.yaml`.

It is observable only because the capture middleware stores the raw request
body, which the `autoreas-request-mcp` server exposes via `search_requests`.

### Drift 2 — observability sanitization is a denylist, not default-deny

`openspec/specs/observability/spec.md` → "Sanitization and Privacy Are
Default-Deny" requires storing "only a sanctioned sanitized subset", forbids
persisting "unrestricted raw request bodies", and requires the `Authorization`
header to be **absent** from the persisted JSON.

The code does none of the three:

| Spec requires | `internal/observability/requestcapture/telemetry.go` does |
| --- | --- |
| no unrestricted raw request bodies | stores raw bodies verbatim |
| `Authorization` absent from persisted JSON | keeps the key, replaces the value with `[redacted]` (line 57) |
| only sanctioned header names/values remain | preserves all headers except four credential names |

Only `Authorization`, `Proxy-Authorization`, `Cookie` and `Set-Cookie` are
touched. Line 62 states the change was deliberate: *"This is a value-scoped
denylist, not a key allowlist, and the distinction is load-bearing."*

**Trap**: `SanitizerConfig` with its `AllowedHeaders`/`AllowedBodyKeys`
allowlists still exists and still compiles, but is dead metadata — its own doc
comment says the fields "are no longer applied by
`SanitizeHeaders`/`SanitizeResponseBody`". Reading that struct and concluding an
allowlist is enforced is the mistake this note exists to prevent.

**Consequence for this change**: the proposed endpoint would be the first
network-facing free-text ingest in this codebase — every other eventlog writer
is a trusted backend call site. Inheriting the current de-facto "preserve
everything verbatim" precedent would be a regression against the written spec.
The design MUST decide explicitly which policy governs the new endpoint, and
this change must either update the stale spec to match reality or hold the new
endpoint to the stricter written requirement.

### Drift 3 — package renamed

`internal/observability/mobilecapture` no longer exists. It is
`internal/observability/requestcapture`, renamed by the archived
`2026-07-25-capture-nomenclature-rename`.

## Findings

### Auth — reuse the existing seam, write no new auth code

Every protected endpoint goes through one function:

```go
// internal/api/router_transport.go:34
func (h *Handler) authenticate(w http.ResponseWriter, r *http.Request) (device.PairedDevice, bool)
```

It extracts the bearer token, calls `deviceService.AuthenticateToken`, and
returns a trusted `device.PairedDevice{DeviceID, Name}`. The new endpoint calls
this exact function.

### Storage — a new dedicated table, not reuse

Both reuse options were considered and both fail the queryability requirement.

| Approach | Verdict |
| --- | --- |
| **A. New dedicated table** | **Recommended** |
| B. Reuse `eventlog` / `runtime_events` | Disqualified |
| C. Extend `request_captures` | Disqualified |

**Why B fails**: `eventlog.EventFilters` (`internal/observability/eventlog/filters.go:9-18`)
is a fixed set — `Domain`, `Level`, `EventType`, `CorrelationID`, `EntityID`,
`Text`, `StartMS`, `EndMS`. There is no field for `trigger_source` or `outcome`.
Making them filterable would mean cramming both into a compound `EventType`
string (`"mobile.cycle.foreground_service.failed"`) or leaving them unfilterable
inside `Metadata` JSON. The second is the exact defect this change exists to fix.

**Why C fails**: `requestcapture.SearchFilters` does have a first-class
`Outcome` column, but it carries the capture's own *transport* outcome
(`internal/observability/requestcapture/types.go:23-31` — `pending`,
`abandoned`, `accepted`). Reusing it for mobile's *cycle* outcome
(`completed`/`failed`/`never_closed`) silently conflates two unrelated meanings
under one column name — the same landmine class already flagged for
`error_code`.

### Proposed shape

Real indexed columns (all closed-vocabulary and bounded client-side, so
server-side validation is cheap defense-in-depth rather than a sanitizer build):

- `device_id`, `cycle_id`, `trigger_source`, `reported_at_ms`
- `previous_outcome`, `previous_last_stage`, `previous_error_cause`,
  `previous_error_fingerprint`

Plain columns, no strong filtering need:

- `previous_error_name`, `previous_native_errcode_byte`, `previous_error_stage`,
  `previous_started_at`, `previous_elapsed_ms`, `consecutive_unclosed_cycles`,
  `pending_ops_count`, `cursor`

> **CORRECTED after design read the client serializer.** An earlier version of
> this list named `outcome`, `last_stage` and `error_*` as current-cycle columns.
> That describes data the wire never carries. `toWireSyncCycleTelemetry`
> (`sync-telemetry.helpers.ts:207-238`) emits exactly six top-level keys —
> `cycle_id`, `trigger_source`, `app_state`, `previous_cycle`, `counters`,
> `recent_events` (plus `degraded` once mobile ships it). Every outcome and error
> field lives ONLY inside `previous_cycle`, which is coherent: the reporting
> cycle is still running when it reports, so it has no outcome yet. The `previous_`
> prefix is therefore accuracy, not decoration. Note also the key is
> `started_at`, not `started_at_ms`, and `counters` is a nested object.

Stored but explicitly **not** a filter dimension:

- `app_state` — mobile hardcodes it to `'background'`
  (`headless-sync-cycle.helpers.ts:76`), so a `foreground_service` cycle reports
  `background`. `trigger_source` is the only trustworthy discriminator until
  mobile fixes it. Do not build a filter on a field that lies.

One JSON blob:

- `recent_events` — the only genuinely variable-shape field (at most 20 entries,
  already coalesced client-side by `(source, event, cause)` with count and
  first/last timestamps). Precedent: `request_captures.correlation_json`.

Explicitly **not** reused: the capture's `error_code` column. It is reserved for
bridge-side failures and is only ever set alongside `rejected`/`malformed`. This
telemetry rides on *successful* requests reporting a *previous* cycle's death,
so projecting onto it would mark a succeeded request as failed.

### Write path — synchronous, against the existing house pattern

`eventlog` and `requestcapture` both write through a non-blocking bounded queue
that **drops silently on overflow** (`internal/observability/eventlog/queue.go:82-89`
— a `select` with a `default:` branch that does `dropped.Add(1)`).

That pattern is correct for those writers, because there an auxiliary write
rides on someone else's canonical response and must never delay it. **The
principle does not transfer here.** For this endpoint the diagnostic POST's ack
*is* the canonical response, and mobile's ring drain is destructive: if the ack
is issued from a best-effort queue that later drops the record, the ack is a lie
and the events are gone permanently.

So: authenticate → decode strictly → synchronous `INSERT` → ack.

**Open cost to quantify in propose**: this puts a SQLite write on the request
path at up to ~4 requests/minute per device during a foreground-service ticker.
Decide the write timeout in propose rather than discovering it in apply.

### Ack design

Recommendation: a plain success/failure status — `204` on success, `4xx`/`5xx`
with no drain on failure — rather than a per-record id or accepted-count. The
payload is always exactly one record per cycle today; there is no batching.
Revisit only if mobile ever batches.

**The server does NOT verify that a reconcile just succeeded.** The
"reconcile first, then POST" sequencing is a client-side behavioral contract,
not a server-enforced invariant. Enforcing it would require cross-request
correlation for no benefit over normal authentication.

### Volume and sizing

- One record per cycle. No batching.
- Measured payload: ~474 B full, ~436 B without error detail, ~185 B without the
  previous cycle. Mobile-side hard cap 4096 B.
- Frequency: background minimum interval is 15 minutes, but the
  foreground-service ticker is **15 seconds**. Size for ~4/min, not 1/15min.
- `MaxCapturedBodyBytes` (`internal/observability/requestcapture/types.go:13`) is
  a **silent** 64 KiB truncation ceiling, well below the 1 MiB `MaxBytesReader`
  on reconcile (`sync_handler.go:41`). Mobile engineered its 4 KiB cap against
  that 64 KiB ceiling specifically to avoid silently vanishing telemetry.

### Transition — the migration tail

A new endpoint does not by itself retire Drift 1. Mobile keeps sending
`client_telemetry` inside the reconcile body until it migrates. Until then:

- The bridge MUST declare-and-ignore the field so it stops being an ungreppable
  ghost.
- **Do NOT add `DisallowUnknownFields()` to reconcile** until mobile has cut
  over. `DisallowUnknownFields()` is live convention in three other handlers
  (`anime_handler.go:142`, `season_rating_handler.go:43`, `router.go:161`), so a
  consistency fix is a plausible future edit — and it would turn every mobile
  reconcile into a 400.
- Announce the field in `docs/openapi.yaml` as optional, accepted and stored
  raw, not interpreted, and mark it deprecated in favour of the new endpoint.

## Open questions for propose

1. **Naming: `device` or `mobile`?** The `capture-nomenclature-rename` precedent
   deliberately dropped "mobile" qualifiers from transport-neutral surfaces
   (`mobile_request_captures` → `request_captures`) because the trust boundary is
   `device.PairedDevice`, not "mobile" specifically. This cuts toward `device`.
2. **Which sanitization policy governs the new endpoint?** See Drift 2. Update
   the stale spec to match the denylist reality, or hold this endpoint to the
   stricter written requirement.
3. **Write timeout** on the synchronous insert.
4. **Retention** for the new table: window, and drop policy when it is exceeded.

## Cross-repo boundary

This change owns: the bridge endpoint, its contract, storage, the
`docs/openapi.yaml` announcement, and the declare-and-ignore of the existing
reconcile field.

This change does NOT own: any autoreas-mobile work. Mobile adopts separately, on
a feature branch off its own `dev`. Mobile-side prerequisites for the cutover —
the ack-gated drain and the `app_state` hardcode fix — are theirs.

## Next recommended

`propose`.

---

## Addendum — material established after this exploration was first written

Recorded here because the later phases depend on it and because two items
correct claims made earlier in this document.

### Additive-migration mechanics

`internal/persistence/schema.go` is the generic driver:

```go
type TableSchema struct {
    Name       string
    CreateDDL  string             // full CREATE TABLE IF NOT EXISTS
    ColumnAdds []ColumnMigration  // additive ALTER TABLE ADD COLUMN, when Migrate is nil
    Indexes    []string           // CREATE INDEX IF NOT EXISTS, always re-run
    Migrate    func(db *sql.DB, cols []string) error
}
func EnsureTableSchema(db *sql.DB, t TableSchema) error
```

Every bounded context exposes its own `SchemaTables()`, assembled in exactly
one place — `initializeBridgeDB` at `internal/sync/sqlite_bootstrap.go:160-164`.
For a brand-new table the work is: a new `internal/observability/<pkg>/schema.go`
mirroring `eventlog/schema.go`, plus ONE line in that composition. Full
`CreateDDL` with every column present from day one, so the `Migrate` hook is
never invoked. Later widening follows the `anime_changed_outbox.changed_fields_json`
precedent (`internal/sync/schema_tables.go:41-65`): nullable `ADD COLUMN`,
reader treats `NULL` as the pre-migration default.

### CORRECTION — the prune counter is not seeded from a row count

An earlier instruction in this change said to seed the prune counter from the
existing row count, citing `eventlog`. **That was a misread of the cited code
and is wrong.** `internal/observability/eventlog/store.go:61` reads:

```go
s.successful++
if s.successful > 1 && s.successful%s.pruneEvery != 0 { return nil }
```

The **first write of every process prunes unconditionally**. The comment above
it gives the reason: the counter is per-process and starts at zero, so cadence
alone would never prune in a session persisting fewer than `pruneEvery` events —
the common case for a short desktop session — letting the table grow past its
cap across restarts and stay there.

`internal/observability/requestcapture/store.go:95` has **no such escape**
(`if s.successful%s.pruneEvery != 0`), so a short session there genuinely never
prunes.

Adopt eventlog's actual mechanism. It satisfies the intent with no `COUNT(*)`
on the single shared connection at construction.

### Surfacing

- **Activity/Network tab: free.** `CaptureMiddleware` wraps `h.mux`
  unconditionally except `/ws` (`internal/api/capture_middleware.go`), so the new
  endpoint's own HTTP transaction appears there like any other — as a transport
  row, not carrying the diagnostic payload's semantic fields.
- **MCP: a new read tool is needed and is NOT in this change.** The sidecar
  registers a closed list of 7 tools via `ValidateToolName`
  (`requestcapture/types.go:205-213`). `openspec/specs/mobile-request-mcp/spec.md`
  has grown that list once before with a documented template — state the old
  count, add named tools with no aliases, assert existing tools are unaffected,
  and hold the read-only invariants (`mode=ro`, `PRAGMA query_only=ON`,
  `VerifyQueryOnly`). Follow-on change: `device-sync-diagnostics-read`.

**This is the change's most important known gap.** Without that tool the data is
queryable in SQL but not through the operator's actual instrument — which is the
same shape of failure that motivated the change.

### Decode strictness

`internal/api/handlers/season_rating_handler.go` is the template: method check →
authenticate (nil-safe) → service nil check (503 if unwired) →
`DisallowUnknownFields()` strict decode into a **bridge-owned** contract type →
business call → outcome switch → response. Reconcile's tolerance of unknown
fields is a migration-safety artifact it cannot escape; a new endpoint owns its
contract from day one and has no such excuse.

### Implementation traps recorded during design

- A `*T` pointer field **cannot** distinguish an absent JSON key from an explicit
  `null`. The present-but-nullable `previous_cycle` rule needs `json.RawMessage`.
- The write deadline must bind the **database call**, not the response. No
  `http.Server` timeout interrupts a handler goroutine, so a response deadline
  answers 503 while still holding the single shared connection — protecting
  nothing, and passing a status-code-only test.
