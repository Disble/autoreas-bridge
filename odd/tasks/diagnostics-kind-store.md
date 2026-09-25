# Diagnostics kind store

## Goal

One telemetry store discriminated by `kind`, replacing the single-shape
`device_sync_diagnostics` table, so a new event kind is a code change instead of a
new table, reader, endpoint and retention policy. Diagnostics, logs and telemetry
are one domain; the number of kinds is unknown and grows for the life of the
product.

The store must be extensible to N kinds without touching the Bridge lifecycle.

## Owner constraints (non-negotiable)

- **No data migration in the Bridge lifecycle.** Not at startup, not on install,
  not on run. Reshaping historical diagnostic rows in the lifecycle is forbidden.
  If a historical rewrite is ever genuinely needed, it is a one-off script an
  operator runs deliberately and that nothing wires in.
- **One table, discriminated by `kind`.** Never a table per kind, never a
  sibling endpoint per kind.
- Diagnostics, MCP and log-sync data is **internal**: not user-visible, not in
  backups, so its preservation never drives a design decision.

## Boundary this slice draws explicitly

**The rule is scoped to historical data only.** It is not a limit on the future
and it is not a reason to under-design. We are designing forward, not patching
backward: every kind from here on gets the complete process and works going
forward. The single prohibition is reshaping **existing** log rows inside the
Bridge lifecycle — that goes through a one-off script nothing wires in.

| Category | In lifecycle | Why |
| --- | --- | --- |
| Create a new table | Allowed | Every table in this repo is born this way (`EnsureTableSchema`); no existing row is touched |
| The fresh DDL being complete — projections, generated columns, indexes for every kind we know | Required | Designing a deliberately partial schema out of caution about `ALTER` is under-design, not caution |
| Forward schema evolution for a kind that needs a projection | Allowed | Ordinary evolution through the declarative driver; no row rewrite |
| A kind arriving as one complete registry declaration | Required | The registry must be complete, not minimal: decoder, validator, projection, retention |
| Rewrite, move, rename or reinterpret existing diagnostic rows | **Forbidden** | This is the `ensureRequestCaptureTableRename` / `migrateRequestCapturesSchema` pattern the owner refuses to see again |

Why the registry plus validated payload is the right forward shape, independent of
the migration rule: with an unknown number of kinds over the product's life, a
table that grows a column set per kind is the shape that does not scale. It is
not a workaround for a constraint.

Existing offenders kept out of scope but recorded as evidence of the pattern:
`internal/sync/sqlite_bootstrap.go` (`ensureRequestCaptureTableRename`) and the
seven live `Migrate:` hooks under `internal/sync/schema_tables.go`,
`internal/download/dbschema/schema.go`, `internal/season/schema.go`.

## Design

- **Package**: `internal/observability/telemetry` owns the envelope, the kind
  registry and the store. The existing `internal/observability/syncdiag`
  validator becomes the registered `cycle_report` kind implementation — its
  proven closed-vocabulary suite is an asset to keep, not to rewrite.
- **Envelope columns** (shared by every kind): `device_id` (from the bearer
  token only, never the body), `reported_at_ms` (receipt clock), `kind`,
  idempotency key, `observed_at_ms` (nullable, client event time), `degraded`
  (nullable fidelity signal), `payload_json`.
- **Identity is scoped per kind**: `UNIQUE(kind, event_id)`. A `cycle_report`'s
  key and an `episode_action`'s key must not share one uniqueness namespace —
  that is the same name-conflation error the spec already forbids for
  `trigger_source`.
- **The stored payload is a snake_case contract, and the envelope owns what the
  envelope owns.** `payload_json` carries only what the envelope columns do NOT
  already own. For `cycle_report` that means `syncdiag.Record` marshals with
  explicit snake_case tags and `json:"-"` on `DeviceID`, `ReportedAtMS` and
  `Degraded` — the three fields whose authority is a column. A nil
  `PreviousCycle` marshals as explicit `null` (the wire contract distinguishes an
  absent key from an explicit null) and an empty `RecentEvents` as `[]`, never
  `null`; no `omitempty` anywhere. This is a **stored** contract, so it is fixed
  now: changing it later would mean reshaping rows, which the lifecycle rule
  forbids.
- **A kind with no declared retention cap is refused, not stored.** `Insert`
  rejects a kind the store has no cap for, before any database work, so the one
  table whose purpose is to be bounded cannot grow without bound through a wiring
  bug.
- **No per-kind columns by default.** A new kind is a registry entry and nothing
  else: zero schema change, zero migration. A field is promoted to a queryable
  projection **only** when a read surface actually filters or sorts on it.
- **Querying a payload field without a migration**: the repo's own idiom —
  a `VIRTUAL` generated column plus an index, exactly as
  `animeSnapshotsNameKeyExpr` does at `internal/sync/schema.go:24-42`. Carry its
  documented lesson over: the `json_valid` guard there is load-bearing, because
  evaluating an expression over unreadable JSON raises and fails the whole write.
- **Kind registry** (Strategy + Registry): each kind declares its strict decoder,
  its validator, its stored projection request and its retention budget. The
  endpoint dispatches on `kind`; an unknown kind is a `400` naming it; the store
  accepts only an already-validated record.
- **Retention is per kind.** A single global cap with heterogeneous write
  frequencies lets a high-frequency kind evict a low-frequency one — the real
  problem behind the original sibling-table proposal, fixed here instead of by
  splitting the domain.
- **Legacy default, frozen**: an absent `kind` still decodes as `cycle_report`,
  byte-identical, for already-deployed mobile. Every new kind MUST carry `kind`
  explicitly; a new kind must never be inferable by absence.
- **Response contract unchanged**: `204` stored or duplicate · two distinct `400`
  shapes (`{error, field}` from validation, generic `{error}` from decode) · `401`
  · `413` · `503` + `Retry-After: 5` · `500`. A shed is never `204`.

## Tasks

### WU1 — discriminated store, kind registry, cycle report as first kind

- [ ] RED: `telemetry` envelope + registry — an unknown `kind` is rejected naming it; a registered kind dispatches to its own validator; the cycle_report kind is reachable by name.
- [ ] RED: legacy compatibility — a body with no `kind` decodes as `cycle_report` with byte-identical behaviour to today, asserted against the existing handler tests.
- [ ] RED: `UNIQUE(kind, event_id)` — the same key string under two different kinds stores two rows; the same `(kind, key)` twice stores one and acks `204`.
- [ ] GREEN: `internal/observability/telemetry` — envelope, kind registry, per-kind retention budget.
- [ ] GREEN: table DDL via `EnsureTableSchema` with **no** `Migrate` hook and **no** `ColumnAdds`; assert the descriptor declares neither.
- [ ] GREEN: store write path — idempotent insert by `(kind, event_id)`, write budget, shed outcome, per-kind prune.
- [ ] GREEN: the `cycle_report` kind registering the existing `syncdiag` validator unchanged.
- [ ] RED: handler dispatch — decode to `json.RawMessage`, read `kind`, dispatch to the kind's strict decoder; both `400` shapes preserved.
- [ ] GREEN: `internal/api/handlers/sync_diagnostics_handler.go` dispatch; same path, same outcomes.
- [ ] RED: no-lifecycle-data-migration guard — boot the schema driver over a database holding legacy `device_sync_diagnostics` rows and assert every row is byte-identical afterwards and that no `Migrate`/`ColumnAdds` hook ran.
- [ ] GREEN: retire `device_sync_diagnostics` from the schema registry; existing rows stay untouched and unread.
- [ ] GREEN: reader + `internal/desktop/app_device_sync_diagnostics.go` Wails binding repointed to the discriminated store, kind-scoped.
- [ ] DOCS: new OpenSpec change; `docs/openapi.yaml` `oneOf` + discriminator that `go run ./tools/checkopenapi` accepts; dated API-consumer-impact entry.
- [ ] ADR: record the kind-discriminated store and the lifecycle boundary table above.
- [ ] GATE: `go test ./...`; both lint profiles via `powershell -File scripts/lint.ps1 -Profile all`; `ditto staged` on the owning package; `go run ./tools/checkgofilesize`; real SQLite integration proof with fixtures copied to a temp location; work-unit commit.

### WU1 slice 1 implementation contract

The design lives here, not in a delegation prompt. A writer reads this section and
does not guess.

**Package**: `internal/observability/telemetry` — envelope, registry, store, DDL,
and the one registered kind `cycle_report`, which delegates to the existing
`internal/observability/syncdiag` validator **unchanged**.

```go
// KindName is a wire discriminator and a member of the closed kind vocabulary.
type KindName = string

const KindCycleReport KindName = "cycle_report"

// Validated is one kind's contribution to a stored event, produced only by a Kind.
type Validated struct {
	EventID      string   // idempotency key, required
	ObservedAtMS *int64   // nullable client event time
	Degraded     *string  // nullable fidelity signal
	Payload      []byte   // re-serialized from validated values, never the client's raw bytes
}

// Kind is one registered telemetry event kind: one complete declaration point.
type Kind interface {
	Name() KindName
	// Decode strict-decodes and validates one request body of this kind.
	// It rejects, never coerces, and its error names the offending field.
	Decode(body []byte) (Validated, error)
	// RetentionLimit is this kind's own row cap. Retention is per kind so a
	// high-frequency kind cannot evict a low-frequency one.
	RetentionLimit() int
}

type Registry struct{ /* unexported */ }
func NewRegistry(kinds ...Kind) *Registry
func (r *Registry) Lookup(name KindName) (Kind, bool)

type Event struct {
	DeviceID     string
	ReportedAtMS int64
	Kind         KindName
	Validated    Validated
}

type Store struct{ /* unexported */ }
func NewStore(db *sql.DB, config StoreConfig) *Store
func (s *Store) Insert(ctx context.Context, event Event) (IngestOutcome, error)
```

`telemetry` owns its own `WriteBudget` (2s), `RetryAfterSecs` (5),
`MaxBodyBytes` (8 KiB), `IngestOutcome` (`Stored`, `Duplicate`, `Shed`) and
`ErrWriteBudget`; the generic store never imports a kind implementation.
`cycle_report`'s `RetentionLimit()` returns `syncdiag.RetentionLimit()`.

**Table** `device_telemetry_events`, declared through `persistence.TableSchema`
and applied by `EnsureTableSchema`: `device_id TEXT NOT NULL`, `reported_at_ms
INTEGER NOT NULL`, `kind TEXT NOT NULL`, `event_id TEXT NOT NULL`,
`observed_at_ms INTEGER`, `degraded TEXT`, `payload_json TEXT NOT NULL DEFAULT
'{}'`, `UNIQUE (kind, event_id)`.

Indexes: only what a query uses — `(kind, reported_at_ms DESC)` for per-kind
recency and the prune, `(device_id, reported_at_ms DESC)` for the per-device
read. The three speculative indexes in `syncdiag/schema.go` are not carried over
(see Resolved during slice 1).

**Store behaviour** mirrors the proven pattern in
`internal/observability/syncdiag/store.go`: `INSERT ... ON CONFLICT(kind,
event_id) DO NOTHING` with `RowsAffected() != 1` meaning `Duplicate` rather than
an error; the write deadline bounds only the database call and a
`context.DeadlineExceeded` returns `Shed` wrapping `ErrWriteBudget`; prune on a
per-process success counter with cadence `pruneEvery` plus an unconditional
prune on the first successful write of the process; a conflict no-op never
advances the counter; a nil `db` returns `Shed` with an error.

**The only change outside the new package**: `WireReport` in
`internal/observability/syncdiag/validate.go` gains an optional declared
`Kind string \`json:"kind"\`` field, so an explicit `kind: "cycle_report"` is not
rejected as undeclared by the existing `DisallowUnknownFields` decode. No
validation rule, vocabulary, member, shape rule or strict-decode behaviour
changes.

**RED tests required before the production code** (prove the failure):

1. An unregistered kind name misses the registry lookup.
2. A registered kind is dispatched to by name.
3. The `cycle_report` kind decodes a body with no `kind` key — the frozen legacy default for deployed mobile.
4. An explicit `kind: "cycle_report"` alias has an identical validation outcome.
5. The same `event_id` under two different kinds stores two rows.
6. The same `(kind, event_id)` twice stores one row and reports `Duplicate`.
7. Pruning keeps the newest N within a kind and never evicts another kind's rows.
8. Pruning runs on the first successful write of the process.
9. A held connection sheds within the write budget, and a shed is never reported as stored.
10. The declared `TableSchema` has a nil `Migrate` and an empty `ColumnAdds` — asserted, because the lifecycle rule needs a machine owner.
11. `payload_json` is re-serialized from validated values, never copied from the client's raw bytes.

**Out of scope for slice 1**: the handler, the router, `syncdiag/reader.go`, the
Wails binding, and the composition root (`internal/sync/sqlite_bootstrap.go`).
Slice-1 tests create the schema directly through `EnsureTableSchema`.

### WU1 slice 2-3 implementation contract

The endpoint becomes kind-discriminated on the same path, and the new store becomes
real at the composition root. This is what lets a registered kind flow at all.

**Kind resolution is the load-bearing part, and it must distinguish absence from an
explicit null.** Deployed mobile sends no `kind` key, so absence means the frozen
`cycle_report` default. An explicit `kind: null` is NOT absence and MUST be rejected:
mobile's own classifier cannot match `undefined` with `null`, so treating null as the
legacy default would deliver a body neither side agrees on. The repo already has this
exact pattern — `syncdiag.WireReport.Degraded` and `PreviousCycle` are
`json.RawMessage` precisely so an absent key and a present `null` stay different
facts. Reuse it:

```go
// probeKind reads only the discriminator, tolerantly, so the body can be
// dispatched before any kind-specific strict decode runs.
var probe struct {
    Kind json.RawMessage `json:"kind"`
}
```

- probe decode fails → `400 {error}` (the existing generic malformed-body shape).
- `probe.Kind == nil` → `KindCycleReport` (key absent; the frozen legacy rule).
- `probe.Kind == []byte("null")` → `400` naming `kind` (present but not a kind name).
- decodes to a non-string → `400` naming `kind`.
- decodes to a string → that name; a registry miss is `400` naming `kind`.

**Handler flow** (`internal/api/handlers/sync_diagnostics_handler.go`), preserving the
shipped contract exactly: method check → authenticate (nil-safe) → ingest seam
nil-check (`503`) → bound the body with `telemetry.MaxBodyBytes` (`413` when
oversize) → probe the discriminator → registry lookup → the kind's own `Decode` →
seam call → outcome switch.

**Error mapping** — the response contract must not change:

| Cause | Response |
| --- | --- |
| `*syncdiag.FieldError` (any kind that reuses it) | `400 {error, field}` |
| decode failure, unknown kind, missing discriminator parse | `400 {error}` or `400 {error, field}` naming `kind` |
| `telemetry.ErrWriteBudget` | `503` + `Retry-After: 5` |
| `telemetry.ErrUndeclaredKind` | `500` — a wiring bug, never a retryable shed |
| any other error | `500` |
| `Stored`, `Duplicate` | `204` |

A shed is never `204`, and `Duplicate` stays indistinguishable from `Stored` on the
wire so a blind retry stays correct.

**Seam and config**: `SyncDiagnosticsConfig` gains the kind vocabulary, and the ingest
seam becomes `IngestTelemetryEventFunc func(ctx, telemetry.Event) (telemetry.IngestOutcome, error)`
in `handlers/common.go`, replacing `IngestSyncDiagnosticsFunc`. The device id still
comes only from the authenticated token; the receipt clock is still the bridge's.

**One declaration point for the vocabulary**: `telemetry.DefaultRegistry()` returns
`NewRegistry(CycleReportKind{})`. Every new kind adds itself there and nowhere else.

**Composition root**: `internal/sync/sqlite_bootstrap.go` appends
`telemetry.SchemaTables()` to the table set, and `internal/desktop/app_sync_diagnostics.go`
builds the registry plus the telemetry `Store` and returns the new seam. The old
`syncdiag.Store` write seam is retired from the wiring here; the `syncdiag` package
itself stays untouched.

**Tests required before the production code**:

1. An absent `kind` still decodes and stores as `cycle_report` — byte-identical to today's behaviour, asserted through the handler.
2. An explicit `kind: null` is rejected with `400` naming `kind`, and stores nothing.
3. A non-string `kind` is rejected with `400` naming `kind`.
4. An unknown but well-formed `kind` is rejected with `400` naming `kind`, and stores nothing.
5. A registered kind dispatches to its own validator and stores under its own name.
6. `ErrUndeclaredKind` maps to `500`, not `503` — the distinction that keeps a wiring bug from becoming a retry loop.
7. `ErrWriteBudget` still maps to `503` with `Retry-After: 5`, and never to `204`.
8. `Stored` and `Duplicate` both ack `204`.
9. An oversize body still reports `413` before any decode.
10. `telemetry.DefaultRegistry()` contains `cycle_report`.

**Out of scope for this slice**: retiring `device_sync_diagnostics` from the schema
registry, the reader and Wails repoint, the `episode_action` kind, and the OpenSpec,
openapi and ADR work.

### WU2 — `episode_action` kind end-to-end

- [ ] Align final wire field names with mobile before writing: `episode_*` (not `chapter_*`), `observation_id` (not `cycle_id`), `observed_at_ms` (not `at`), `outcome` gated as one cross-field rule against `phase`, `duration_ms` with one direction.
- [ ] RED: kind validator — each closed vocabulary, the `phase` x `outcome` cross-field rejection, and the `duration_ms` direction rule.
- [ ] RED: `cause` gated by a distinctly named set whose members match `previous_cycle.error_cause`.
- [ ] GREEN: register the kind; no schema change, no per-kind column, no migration.
- [ ] DOCS: spec + `docs/openapi.yaml` variant, additive.
- [ ] GATE: same gate as WU1; work-unit commit.

### Decided during slice 1 review

Slice 1 landed green (42 mutants, 41 killed, score 0.98; `go test ./...` clean;
both lint profiles `0 issues.`; `checkgofilesize` clean) and was then reviewed by
the orchestrator against the running code rather than against the writer's report.
Two findings came out of that review and both are now corrections.

- [x] **The stored payload shape was wrong.** `json.Marshal(syncdiag.Record)`
  produced Go field names at the top level and inside `PreviousCycle` while
  `RecentEvents` used snake_case, and carried `DeviceID: ""` and
  `ReportedAtMS: 0` — fake values duplicating authority the envelope columns own.
  Verified by printing the real bytes from a decode, not inferred. Fixed with an
  explicit tag contract in `syncdiag/types.go`; `telemetry/cycle_report.go:45` is
  the only place in the repo that marshals `Record`, so the change is isolated.
- [x] **The test that pinned it was circular.** It asserted
  `bytes.Equal(payload, json.Marshal(record))` — both sides marshal the same
  struct, so it passed regardless of the tags and could never catch the
  regression. Replaced with a literal golden payload, and required proof that the
  test now fails when a single tag is removed.
- [x] **The table could grow without bound.** `Insert` stored events for a kind it
  had no declared cap for, and pruning then silently did nothing for them. Closed:
  `Insert` now refuses such a kind before any database work, returning `Shed`
  together with a new `ErrUndeclaredKind` sentinel.
- [x] **Recorded as the reason the writer's own test was trusted less than the
  code.** The writer reported the payload shape as a *risk* with a defensible
  rationale ("DeviceID/ReportedAtMS appear zero-valued... the envelope columns are
  authoritative"). It was a contract defect, not a risk, and only reading the real
  bytes and the test body showed it. The writer also reported the retention hole
  as tested, documented behaviour; documenting a hole is not closing it.

### Resolved during slice 1

- [ ] Resolve the transient constant duplication: slice 1 gives `telemetry` its own `WriteBudget`, `RetryAfterSecs`, `MaxBodyBytes`, `IngestOutcome` and `ErrWriteBudget` so the generic store never imports a kind implementation. `syncdiag` keeps its own copies meanwhile. A later slice repoints the handler and retires `syncdiag`'s copies, so exactly one owner remains.
- [ ] Record the finding on `internal/observability/syncdiag/schema.go`'s three speculative indexes (`..._trigger_source`, `..._previous_outcome`, `..._previous_error_fingerprint`): no query in `reader.go` filters on any of them — `ReportQuery` carries only `DeviceID` and `Limit`. They cost write time for nothing. Do not carry them into the new store; retire them with the old table.

### Deferred, needs an explicit owner decision

- [ ] One-off script to reshape historical `device_sync_diagnostics` rows into the new shape. **Only if the owner wants the history**; the data is internal and not in backups, so the default is to leave the old rows in place unread and write no script.
- [ ] Whether MCP captures (`request_captures`) and log-sync ever join this store. They are currently out of scope: `request_captures` backs the user-visible Activity UI and already carries a lifecycle `Migrate` hook, so folding it in is a separate work unit with a real UX constraint, not a consequence of this decision.
- [ ] RED guard for the wrong comment above `validateRecentEvents` and its uncovered 400-on-unknown-key-inside-a-`recent_events`-element path. Found by mobile; a comment and test gap, not a behaviour change, so it stays out of WU1.

## Constraints

- Never commit to `main`; branch `feat/diagnostics-kind-store` off `dev`.
- Keep Go and frontend files at or below 500 effective lines.
- The shipped `POST /api/sync/diagnostics` contract changes additively only: deployed mobile behaviour stays byte-identical.
- Tests follow RED → GREEN → MUTATE → REFACTOR; a test must fail when its guard is removed.
- Do not weaken any threshold, exclusion or gate to make a failure disappear.

## Evidence

**WU1 slice 1 — commit `5bbcbf3`** (16 files, 1850 insertions, 23 deletions). The
new `internal/observability/telemetry` package plus the single allowed outside
change (`kind` declared on `syncdiag.WireReport`) and the stored-payload tag
contract on `syncdiag.Record` / `syncdiag.PreviousCycle`.

- Pre-commit gate (lefthook, no `--no-verify`): openapi passed · gofmt passed ·
  go-filesize passed · architecture passed · golangci-lint `0 issues.` on both
  profiles · go-vet passed · go-cover passed. `telemetry` coverage 90.9%,
  `syncdiag` 91.3%.
- `go test ./...` clean; `checkgofilesize` warnings are all pre-existing files in
  other packages.
- `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/observability/telemetry/"`: 42 mutants,
  41 killed, **score 0.98**.
- **Accepted survivor, deliberately not suppressed**: `store.go:98`
  `pruneErr != nil` → `== nil`. Its only observable effect is a `log.Printf`, and
  it mirrors the proven `syncdiag` pattern; killing it needs global `log.SetOutput`
  capture. The threshold was not weakened to hide it. Revisit only if a prune
  failure ever needs to be observable to a caller rather than a log.
- **Payload golden proven to fail**: removing the `json:"-"` tag from
  `Record.DeviceID` makes two golden tests fail and shows `"DeviceID":""`
  appearing in the payload. A test that cannot fail is not evidence, so the proof
  is recorded rather than assumed. The file was restored byte-identically
  afterwards (`diff` empty).
- Verified independently by the orchestrator against the running code, not from
  the writer's report. That review is what found the three defects recorded under
  "Decided during slice 1 review".

**WU1 slices 2-3** — the endpoint is kind-discriminated on `POST /api/sync/diagnostics`, and
the discriminated store is real at the composition root.

- Delivered: the `json.RawMessage` discriminator probe, `telemetry.DefaultRegistry()`
as the single vocabulary declaration point, the `IngestTelemetryEventFunc` seam,
`telemetry.SchemaTables()` registered in `sqlite_bootstrap.go`, and the store built in
`app_sync_diagnostics.go` from the same registry the handler dispatches on.
- `go test ./...` clean; `checkgofilesize` passed; both lint profiles `0 issues.`
- `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/api/handlers/ ./internal/observability/telemetry/ ./internal/desktop/"`:
  7 mutants, 7 killed, **score 1.00**.
- **Sixteenth test review finding, fixed by the orchestrator**: a body that is
  literally `null` was answered `400 {"error":"missing required key","field":"degraded"}` —
  blaming a `cycle_report` the body never declared. A JSON `null` decodes into a nil
  map WITHOUT an error, so it fell through to the frozen absent-key default. Every
  other non-object (`[1,2,3]`, a string, a number, a boolean) already produced the
  generic 400, so the endpoint disagreed with itself about what a non-object body is.
  Probed empirically before fixing, not inferred: the response above was observed.
  The probe is now a `map[string]json.RawMessage` and a nil map is refused as an
  unreadable body, which keeps absent-versus-null intact for the discriminator while
  making every non-object uniform. `{}` is deliberately NOT folded in: an empty object
  genuinely is a `cycle_report` that omitted a required key, so it keeps the
  which-field 400 naming `degraded`. Both sides are now pinned by tests.
- The writer's own report flagged the `ditto` command scoping honestly (a desktop
  mutant stayed out of the score under the narrower test command, which it then
  widened to reach 1.00) rather than reporting a score that hid it.

**WU1 slice 4 and WU2** — pending.

## Open items carried from coordination

- Mobile is currently destroying its own `episode_action` observations: its flush
  (`sync-diagnostics-flush.helpers.ts:80`) treats `400/413/422` as permanent and
  removes the row, and its undeclared top-level `kind` produces exactly that
  `400`. Nothing in this repo fixes that; it is a mobile-side stop-loss.
- Verified finding to hand back: the comment above `validateRecentEvents` claims
  an undeclared key inside a `recent_events` element is "already dropped by the
  initial `json.Unmarshal`". It is not — `DisallowUnknownFields` applies to every
  struct the decoder descends into, slice elements included, and the element
  produces `json: unknown field "..."` and a `400`.
- `openspec/changes/mobile-log-ingestion` is complete (42/42, verify PASS) and
  still unarchived.
