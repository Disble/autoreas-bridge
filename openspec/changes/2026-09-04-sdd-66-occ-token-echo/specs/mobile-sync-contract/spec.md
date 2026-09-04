# Delta for mobile-sync-contract

SDD-30 built optimistic concurrency control (OCC) around a per-record
`modified_at` token, but the reconcile wire contract never exposed it:
`applied_operations` carried only `anime_id`, `operation`, and `applied`,
and a conflict was mapped to an error that aborted the whole batch with
HTTP 500. This delta lets a client learn its next OCC token from the
reconcile response and turns a conflict into a per-operation outcome that
never aborts the batch.

## MODIFIED Requirements

### Requirement: Sync Reconcile Returns Bridge Changes

The system MUST accept an authenticated `POST /api/sync/reconcile` request
body compatible with the RFC/mobile shape and return bridge changelog
entries newer than `last_changelog_id`. Each entry in `applied_operations`
MUST carry the bridge's current OCC token for that anime as `modified_at`
whenever a write outcome was computed for that operation (applied, no-op,
or conflict) — including when that token's value is `0`, which is a
legitimate token in this codebase, never a sentinel for "no token" — and
MUST omit the `modified_at` key entirely when no write outcome was
computed, i.e. for an unsupported/skipped operation. A conflicting
operation MUST be reported as a per-operation outcome (`applied: false`)
rather than aborting the batch: the HTTP status, `last_changelog_id`, and
`bridge_changes` MUST be unaffected by a conflict, and the response MUST
still contain exactly one `applied_operations` entry per submitted pending
operation, in submission order. Every entry with `applied: false` MUST
carry a `reason` drawn from the closed vocabulary `unsupported_operation`
(permanent — discard the operation) or `conflict` (recoverable — re-base
on the echoed `modified_at` and retry); `reason` MUST be absent whenever
`applied` is `true`. A client that receives a `reason` value outside this
vocabulary MUST surface it rather than silently discarding the operation.
Once an operation for a given `anime_id` has conflicted within a batch, the
system MUST NOT apply any later operation for that same `anime_id` in that
same batch that omits `base`, and MUST report it as `applied: false` with
`reason: "conflict"` and the same winning `modified_at`. A later operation
for that `anime_id` that DOES carry `base` MUST still be evaluated on its
own merits.

Rationale, recorded because it is not deducible from the fields: omitting
`base` is the deliberate OCC bypass, so without this rule a batch could
have its first operation for a record correctly rejected as a conflict and
then a later base-less operation for the same record silently overwrite the
very value the rejection protected — the guard firing while the write lands
behind it. Aborting the batch used to prevent this as a side effect; making
a conflict non-fatal removes that accidental protection, so it is restored
deliberately here.

(Previously: `applied_operations` entries carried only `anime_id`,
`operation`, and `applied`, with no token echo and no failure
classification; a conflicting write was mapped to an error that aborted
the batch mid-loop and produced HTTP 500, discarding `applied_operations`,
`bridge_changes`, and `last_changelog_id` for the entire request — a
behavior `docs/openapi.yaml` had already documented as reachable, even
though it never was.)

#### Scenario: Reconcile request with compatibility body
- GIVEN a valid bearer token
- WHEN the client sends `POST /api/sync/reconcile` with `device_id`, `last_changelog_id`, and `pending_operations`
- THEN the system returns 202 Accepted or 200 OK
- AND the response includes `status`
- AND the response includes `last_changelog_id`
- AND the response includes `applied_operations`
- AND the response includes `bridge_changes`
- AND the response includes `conflicts`

#### Scenario: Pending update operations are applied compatibly during reconcile
- GIVEN the bridge still exposes `PATCH /api/animes/:id` as the canonical write path
- AND the client sends `pending_operations` with update-compatible payloads inside reconcile
- WHEN the bridge processes the reconcile request
- THEN the system applies those updates through the same validation and write rules used by `PATCH /api/animes/:id`
- AND the system appends the resulting merged snapshot to legacy `animes.dat`
- AND the response marks those operations as applied in `applied_operations`
- AND the corresponding entry's `modified_at` is the bridge's token for that anime after the write
- AND the response still returns bridge-side changes successfully

#### Scenario: Applied pending operation echoes its new token
- GIVEN a pending `update` operation that changes at least one field on an anime the bridge accepts
- WHEN the bridge applies that operation
- THEN the operation's `applied_operations` entry has `applied: true`
- AND the entry's `modified_at` is the new bridge-assigned token for that anime
- AND the entry omits `reason`

#### Scenario: No-op pending operation echoes the bridge's unchanged token, including zero
- GIVEN a pending `update` operation whose payload is byte-identical to the anime's current stored value
- AND that anime's current bridge token (`modified_at`) is `0`
- WHEN the bridge processes that operation as a no-op
- THEN the operation's `applied_operations` entry has `applied: true`
- AND the entry's serialized JSON body includes the key `"modified_at":0`, present rather than omitted
- AND the entry omits `reason`

#### Scenario: Conflict is reported per-operation without aborting the batch
- GIVEN a pending `update` operation whose base token no longer matches the anime's current bridge token
- WHEN the bridge processes the reconcile request
- THEN the HTTP response status is unchanged at 202 Accepted
- AND the operation's `applied_operations` entry has `applied: false` and `reason: "conflict"`
- AND the entry's `modified_at` is the bridge's current winning token for that anime
- AND the response still includes `last_changelog_id` and `bridge_changes`
- AND operations submitted after the conflicting one are still processed

#### Scenario: Unsupported pending operations are ignored during reconcile
- GIVEN a reconcile request contains pending operations the bridge does not yet support server-side
- WHEN the system processes the request
- THEN unsupported operation types are ignored
- AND the response marks those operations as `applied=false` in `applied_operations`
- AND each such entry has `reason: "unsupported_operation"`
- AND each such entry's serialized JSON body omits the `modified_at` key entirely
- AND supported update-compatible operations are still applied

#### Scenario: A mixed batch preserves submission order and outer response fields
- GIVEN a reconcile request whose `pending_operations` contains one operation the bridge applies, one that conflicts, and one of an unsupported type, in that order
- WHEN the bridge processes the batch
- THEN `applied_operations` contains exactly three entries, in the same order as submitted
- AND the first entry has `applied: true` with `reason` omitted
- AND the second entry has `applied: false`, `reason: "conflict"`, and a present `modified_at`
- AND the third entry has `applied: false`, `reason: "unsupported_operation"`, and an omitted `modified_at`
- AND the response still includes `last_changelog_id` and `bridge_changes`

#### Scenario: A base-less operation after a conflict on the same anime is not applied
- GIVEN a reconcile batch containing two `update` operations for the same `anime_id`, in that order
- AND the first carries a `base` that no longer matches the anime's current bridge token
- AND the second omits `base` entirely
- WHEN the bridge processes the batch
- THEN the first entry has `applied: false` and `reason: "conflict"`
- AND the second entry also has `applied: false` and `reason: "conflict"`
- AND the second operation's payload is NOT written to the anime
- AND both entries carry the same winning `modified_at`
- AND the HTTP response status is unchanged at 202 Accepted

#### Scenario: A based operation after a conflict on the same anime is still evaluated
- GIVEN a reconcile batch containing two `update` operations for the same `anime_id`, in that order
- AND the first carries a stale `base` and is rejected as a conflict
- AND the second carries a `base` equal to the anime's current bridge token
- WHEN the bridge processes the batch
- THEN the first entry has `applied: false` and `reason: "conflict"`
- AND the second entry has `applied: true` with `reason` omitted
- AND the second operation's payload IS written to the anime

#### Scenario: Reason is absent whenever an operation is applied
- GIVEN a reconcile batch containing only operations the bridge applies successfully, including a no-op write
- WHEN the bridge builds `applied_operations`
- THEN every entry has `applied: true`
- AND every entry's serialized JSON body omits the `reason` key entirely
