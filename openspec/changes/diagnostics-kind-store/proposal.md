# Proposal: Diagnostics Kind Store

> **Status of the record.** `openspec/` is historical evidence in this repository, not an active
> contract. The execution contract is the code plus the current product documentation
> (`docs/openapi.yaml` for the wire surface); where this file and the code disagree, the code wins as
> runtime truth, and the drift is recorded before any correction is planned. This change is **not
> verified complete**: slices 1, 2–3, 4a, the `episode_action` kind and the refusal vocabulary have
> shipped; slice 4b was still open at the time of writing. There is deliberately no `verify-report.md`.

## Intent

One telemetry store discriminated by `kind`, replacing the single-shape `device_sync_diagnostics`
table, so that a new event kind is a code change instead of a new table, reader, endpoint and
retention policy. Diagnostics, logs and telemetry are one domain; the number of kinds is unknown and
grows for the life of the product.

Success: the store is extensible to N kinds without touching the Bridge lifecycle, and a kind is one
complete declaration — strict decoder, validator, stored projection, retention cap — registered in
exactly one place.

## Problem

Two independent defects, both measured rather than hypothesised.

**1. A single-shape table that nothing could query.** `device_sync_diagnostics` was born with one
kind's 21 columns hardcoded into it. ADR-025 records what that cost, measured 2026-09-19: the table
held **212 rows across 6 devices with zero readable paths**, and the only `SELECT` in the package was
the retention prune. A second kind in that shape costs a table, a reader, an endpoint and a retention
policy, and the retention cap is global — so a high-frequency kind can evict a low-frequency one.

**2. A piggybacked delivery path that lost most of the evidence it collected.** Mobile's
`drainDiagnosticEvents()` (`headless-sync-cycle.helpers.ts:77`) empties the app-wide ring
unconditionally, before the `try` at line 89 and 19 lines before the HTTP call at line 96 that was
supposed to carry it, with no re-buffer anywhere. Every cycle whose reconcile fails therefore
destroys the ring permanently, into the exact state that produces the evidence, and a device offline
for N cycles transmits 1 of N. Recorded with its full case in
`openspec/changes/mobile-log-ingestion/proposal.md`; the durable endpoint is the response, and this
change is the store behind it.

## Scope

### In Scope

- `internal/observability/telemetry`: the shared envelope, the kind registry, the discriminated store,
  the descriptor, per-kind retention, and the generic read side.
- `cycle_report` as the first kind, delegating to the **unchanged** `syncdiag` validator, so the first
  kind's behaviour is the behaviour that already ships.
- `episode_action` as the second kind: one observable step of a mobile episode action, so a step that
  never finishes is still recorded.
- Kind discrimination on the existing `POST /api/sync/diagnostics` path — never a sibling endpoint.
- The frozen legacy default: an absent `kind` still decodes as `cycle_report`, byte-identical for every
  already-deployed mobile build.
- A refusal code vocabulary on every refusal this operation emits.
- `docs/openapi.yaml`: the request `oneOf` with `discriminator.propertyName: kind`, the
  `SyncDiagnosticsRefusalCode` component, and a dated consumer-impact entry.
- The read repoint, so the desktop read surface reads the table the write path fills.

### Out of Scope

- Any `autoreas-mobile` change, including the stop-loss for observations it is currently discarding.
- Retiring `device_sync_diagnostics` from the schema registry, and deleting what only existed to serve
  it. That is slice 4b, still open; the table stays registered and its rows stay untouched and unread
  until it lands.
- A deliberately-invoked one-off script to reshape historical `device_sync_diagnostics` rows — invoked
  by a person once, wired into nothing, deleted after use. Only if the owner wants the history; the data
  is internal and not in backups, so the default is to write no script and leave the old rows unread.
- Folding MCP captures (`request_captures`) or log-sync into this store. `request_captures` backs the
  user-visible Activity UI and already carries a lifecycle `Migrate` hook, so it is a separate work unit
  with a real UX constraint.
- Moving the `cycle_report` kind out of `telemetry` so the generic package stops importing a specific
  kind's error type. Recorded as a layering inversion; not this change.

## Capabilities

### New Capabilities

- `device-telemetry-kinds`: the kind registry, the shared envelope, the discriminator semantics,
  per-kind identity and retention, the stored-payload contract, the refusal vocabulary, and the
  lifecycle boundary the schema driver may not cross.

### Modified Capabilities

- `device-sync-diagnostics`: the same endpoint, the same path and the same shipped behaviour for a body
  that names no kind. Its storage requirement is superseded — the row lives in the kind-discriminated
  store, and the reader reads that store.
- `openapi`: the operation's request schema becomes a `oneOf` with a discriminator, and every refusal
  gains a `code`.
- `sqlite-bootstrap`: the table set gains `telemetry.SchemaTables()`, and later loses
  `syncdiag.SchemaTables()` (slice 4b).

## What Changes

**The store.** One table, `device_telemetry_events`, shared by every kind. The envelope —
`device_id` (from the bearer token only, never the body), `reported_at_ms` (the bridge's receipt
clock), `kind`, `event_id`, nullable `observed_at_ms`, nullable `degraded`, `payload_json` — is owned
by every kind alike; identity is scoped per kind through `UNIQUE (kind, event_id)`. Indexes are only
what a query uses. The descriptor declares **no `Migrate` hook and no `ColumnAdds`**, and a test pins
that, because the owner's rule needs a machine owner.

**The kind.** A registry entry and nothing else: a strict decoder that rejects rather than coerces, a
validator, a stored projection, and its own retention cap. A kind the store has no declared cap for is
refused before any database work, because the one table whose purpose is to be bounded must not grow
without bound through a wiring bug. Retention is enforced at prune time, never at write time, so
changing a kind's cap later rewrites no row.

**The discriminator.** The endpoint reads `kind` as a raw JSON value, exactly as `syncdiag` types
`degraded` and `previous_cycle`, because an absent key and a present `null` are different facts here:
absent is the frozen `cycle_report` default, and a present `null` is refused. A new kind is reachable
only by naming it; no new kind is ever inferable from absence.

**The stored payload.** A snake_case contract, and the envelope owns what the envelope owns: the three
fields whose authority is a column marshal as `json:"-"`, an explicit `null` stays distinct from an
absent key, and a stable key set is preferred to omitting keys, so a later reader can query it without
first establishing which keys exist. This is a stored contract, so it is fixed now — changing it later
means reshaping rows.

**The refusals.** Every refusal carries a `code` from a closed vocabulary that grows. `kind_not_served`
is the only recoverable member, because the bytes are not wrong — this build does not serve them — so a
forward roll recovers every row a client kept.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/observability/telemetry/` | New package | Envelope, registry, store, descriptor, reader, and the two kinds' own files |
| `internal/api/handlers/sync_diagnostics_handler.go` | Modified | Discriminator probe, registry dispatch, refusal codes; the shipped response contract is preserved |
| `internal/api/handlers/common.go`, `server.go`, `router.go` | Modified | `IngestTelemetryEventFunc` seam carrying `telemetry.Event` |
| `internal/desktop/app_sync_diagnostics.go` | Modified | Registry and store built from the same registry the handler dispatches on |
| `internal/desktop/app.go`, `app_defaults.go`, `app_runtime_services.go`, `app_device_sync_diagnostics.go`, `app_observability_facts.go` | Modified | Read surfaces repointed to the store the write path fills, keeping the capability name and the DTO field set identical |
| `internal/observability/readcap/catalog.go`, `internal/mcp/requestcapture/manifest.go`, `internal/api/contracts/capture.go` | Modified | The declared store name and its reasons; names and reasons only, no logic |
| `internal/sync/sqlite_bootstrap.go` | Modified | `telemetry.SchemaTables()` added; `syncdiag.SchemaTables()` removal is slice 4b |
| `internal/observability/syncdiag/` | Modified | `WireReport.Kind` declared; stored-payload tags on `Record`/`PreviousCycle`. No validation rule changed |
| `docs/openapi.yaml` | Modified | `oneOf` + discriminator, `SyncDiagnosticsRefusalCode`, dated 2026-09-25 consumer-impact entry |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| **The stored payload is fixed at write time.** A tag or key-shape change later is a row reshape, which the lifecycle rule forbids | High if unnoticed | The payload is asserted against a literal golden, not against a re-marshal of the same struct; that test was proven to fail when a single tag is removed |
| **The retained row can grow without bound** if a kind is servable with no declared cap | Medium | `Insert` refuses such a kind before any database work and returns `Shed` with `ErrUndeclaredKind`; the wiring bug is a `500`, never a retryable `503` |
| **A historical rewrite is reintroduced later**, quietly, by a future slice | Medium | The guard test is the machine owner; its behavioural half (boot the driver over legacy rows) is still owed by slice 4b |
| **A client reads a status instead of a code** and discards recoverable observations | Medium | `kind_not_served` is documented as the one recoverable member, and the client rule is per row: no code means park |
| **Version coupling cannot be solved by release ordering** — a `400` with no `code` states which build answered, not that the bytes are wrong | High, inherent | Stated as the reason the client rule is per row rather than per release; the recoverable class never shares the status that means "never acceptable" |
| The read side lags the write side, so a user-visible surface reads a table nothing writes | Occurred once (found in slice 3), repaired in slice 4a | The reader moved with the store, and the repair was verified as a behaviour change — every DTO field round-trips, including the three that moved inside the stored `previous_cycle` |
| MCP and log-sync consumers assume this store now covers them | Medium | Named as out of scope with the reason: `request_captures` backs a user-visible UI and carries its own lifecycle hook |

## Rollback Plan

Revert the commit range. The new table is additive: the composition line goes away, existing rows stay
inert, and the endpoint's contract for a body that names no kind is unchanged, so no deployed mobile
build notices. `device_sync_diagnostics` is still registered until slice 4b, which is why slice 4a was
kept separately revertible. Slice 4b's removal of the registry line is also revertible — the table is
never dropped, so nothing needs to be migrated back.

## Dependencies

- **Mobile's kind-carrying emissions.** A kind is reachable only by naming it; mobile's
  `episode_action` traffic is gated on their own flip. Already-deployed builds keep sending no `kind`
  and keep the frozen default.
- **Mobile's own classifier must distinguish an absent `kind` from a `null` one.** Recorded on our side
  as the reason an explicit `null` is refused rather than folded into the legacy default.

## Success Criteria

- [x] A body with no `kind` decodes and stores as `cycle_report`, byte-identical to the behaviour that
      shipped before this change.
- [x] An explicit `kind: null` is refused with `400`, and stores nothing.
- [x] An unregistered kind is refused with `400` carrying `kind_not_served`, and stores nothing.
- [x] The same `event_id` under two different kinds stores two rows; the same `(kind, event_id)` twice
      stores one row and acks `204`.
- [x] A kind with no declared retention cap is refused rather than stored.
- [x] Pruning keeps the newest N within a kind and never evicts another kind's rows, including on the
      first successful write of the process.
- [x] A held connection sheds within the write budget, a shed is never reported as stored, and a shed
      is never `204`.
- [x] The descriptor declares no `Migrate` hook and no `ColumnAdds`.
- [ ] The full table set can be applied over a database holding legacy `device_sync_diagnostics` rows
      with every row byte-identical afterwards, the table still present, and no `Migrate` or
      `ColumnAdds` hook run. **Slice 4b; not complete at the time of writing.**
