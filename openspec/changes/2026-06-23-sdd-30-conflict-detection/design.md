# SDD-30 — Design: Sync Conflict Detection (non-blocking OCC, soft-delete, conflict storage)

Status: designed
Change: 2026-06-23-sdd-30-conflict-detection
Artifact store: hybrid (this file + engram `sdd/2026-06-23-sdd-30-conflict-detection/design`)
Inherits (binding): proposal.md + engram decision #4298. This design pins the HOW; it does NOT
relitigate the model. Scope is FIXED per #4298 — no expansion.

---

## 1. Architecture overview

The change adds an **optimistic-concurrency (OCC) gate** to the single mobile write path and a
**bridge-owned version token** (`modified_at`) that every accepted change stamps. The token is the
"base" that mobile echoes; comparing echoed base vs current token is the entire conflict-detection
primitive. On divergence the bridge is **non-blocking** (Syncthing model): it preserves both values,
records a conflict row, fires a `Notify(Source:"sync", Level:warning)`, and still returns success to
mobile. Two adjacent correctness fixes ride along: **soft-delete** (stop the physical prune of
`$$deleted`/absent records) and the **conflict writer** (`InsertConflict`) that the table DDL has
always been waiting for.

The design respects the existing hexagonal seams:

- The **write port** is `WriteService.PatchAnime` (`internal/anime/service.go:155`). It already loads
  the current snapshot (`store.GetSnapshot`, `service.go:156`) — the base it needs is already in hand.
- The **handler** (`applyPendingOperations`, `sync_handler.go:82`) is a thin decode+dispatch loop. It
  must NOT learn the OCC rules; it only forwards the echoed `base` through the patch contract.
- The **observe path** (`startup_catchup.go:196-209`, `watcher.go:282`) ingests desktop file deltas
  via `DiffSnapshots` + `ReplaceBaseline`. It must stamp the token so desktop edits do not leave a
  stale token that mis-flags the next mobile write.
- The **conflict store** (`internal/sync/conflict_store.go`) gains `InsertConflict`; the table DDL
  (`sqlite_bootstrap.go:37-47`) already has `local_snapshot_json` + `remote_snapshot_json`.
- The **notifier** (`internal/notification/notifier.go`) injects via constructor deps exactly as
  `RuntimeWatcherConfig.Notifier` (`watcher.go:49-53`) and `download.ServiceDeps.Notifier`
  (`download/service.go:63`) already do — a nil Notifier is a safe no-op.

Layering rule (unchanged): the anime context never imports `internal/sync` directly. The conflict
writer + notifier are passed into `WriteService` as **ports** (interfaces declared in the anime
package), wired in the composition root (`app.go`). This mirrors `download.ServiceDeps` ADR-5.

```
mobile PATCH ──> sync_handler.applyPendingOperations ──> WriteService.PatchAnime (OCC GATE)
                  (decode + forward base)                  │
                                                           ├─ base==current ─> fast-forward apply + stamp
                                                           ├─ value==current ─> no-op success
                                                           └─ base!=current ─> ConflictWriter.InsertConflict
                                                                                + Notifier.Notify (non-blocking)

desktop edit ─> watcher / startup_catchup ─> DiffSnapshots ─> stamp modified_at ─> ReplaceBaseline
$$deleted / absent ─────────────────────────────────────────> LOGICAL delete (Activo=0 + FechaEliminacion), retain row
```

---

## 2. THE `modified_at` decision (ADR-30-1) — the critical one

### Decision

**`modified_at` is a bridge-private, strictly-monotonic, per-anime token stored as a dedicated INTEGER
column on `anime_snapshots`, generated as `next = max(now_unix_milli, last_token + 1)` at every stamp.
It is surfaced to the user/mobile as a "modified date" (the milliseconds ARE a wall-clock instant), but
its correctness as an OCC base does NOT depend on the wall clock being monotonic.**

This is option **(c) counter-backed / strictly-increasing modified_at**, with a deliberate nod to
honoring the user's "modified date" framing (the value reads as a real timestamp), while the
`max(now, last+1)` rule gives the monotonic GUARANTEE a plain wall clock cannot.

### Why not the alternatives

| Option | Rejected because |
|--------|------------------|
| (a) plain monotonic int counter | Loses the user-facing "modified date" semantics entirely. The user explicitly framed the token as a modified date; a bare opaque counter throws away a meaningful, displayable instant for zero correctness gain over (c). |
| (b) content hash of canonical snapshot | A hash answers "is the content identical" but NOT "is this the state mobile based its edit on" once the SAME value is reached by two paths. Worse: a legitimate **correction back to a prior value** (13->12, the exact paradox in #4298) reproduces an OLD hash, so `base==current` would falsely pass for a stale write that happens to match. Hash also gives no natural ordering for tie-breaks. Content-hash is the WRONG primitive for state-based-absolute-value OCC. We KEEP `snapshot_hash` for change-detection in `DiffSnapshots` (line 50) — but it is NOT the OCC token. |
| (d) hybrid (counter + date concatenated) | Two fields to store, echo, and compare; no benefit over (c), which already IS a date that is also strictly increasing. Rejected as over-engineering (consistent with #4298's idempotency-key rejection). |

### Collision and clock-regression handling (the two failure modes the proposal forwarded)

- **Same-millisecond collision** — two accepted changes within one `time.Now().UnixMilli()` tick would
  produce equal tokens under a plain wall clock, so a second write's echoed base could match a token it
  never actually saw. `max(now, last+1)` FORCES `next >= last+1`, so two stamps in the same millisecond
  get distinct, strictly increasing tokens. No collision possible.
- **Clock regression** — if the OS clock moves backward (NTP correction, VM resume, DST/manual change),
  `now < last`. A plain wall-clock token would REGRESS, making a fresh write carry a token LOWER than a
  stale one, silently breaking `base==current` equality and risking lost updates. `max(now, last+1)`
  CLAMPS to `last+1`, so the token never regresses regardless of clock behavior.

The token is therefore monotonic **per anime** (each anime stamps relative to its own `last_token`),
which is exactly the granularity OCC needs (the base is per-anime). No global sequence, no cross-anime
ordering requirement.

### Storage (pinned)

New column on `anime_snapshots`:

```sql
CREATE TABLE IF NOT EXISTS anime_snapshots (
    anime_id      TEXT PRIMARY KEY,
    snapshot_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    modified_at   INTEGER NOT NULL DEFAULT 0   -- NEW: OCC token, unix millis, strictly monotonic per anime
)
```

`modified_at` lives on the SNAPSHOT row, NOT inside the canonical JSON. Reasons:

1. It is bridge-PRIVATE metadata, not a `LegacyAnimeRaw` domain field. Putting it in `snapshot_json`
   would pollute the canonical anime payload, leak into `MobileAnime` serialization paths
   unintentionally, and risk being written back to `animes.dat`.
2. `#4298` and the proposal are explicit: it MUST NOT be conflated with `FechaUltCapVisto` /
   `StampServerTimestamp` (`anime_raw.go:527-529`). A separate column physically guarantees no overload.
3. A column is cheaply comparable in SQL and stamped atomically alongside `snapshot_json`/`snapshot_hash`
   in `ReplaceBaseline`.

`SnapshotRecord` (`snapshot.go:11-15`) gains a `ModifiedAt int64` field so the token travels with the
record through `GetSnapshot`/`ListSnapshots`/`ReplaceBaseline`/`DiffSnapshots`. `HashSnapshot` is
unchanged (the token is NOT part of the hash — otherwise stamping would force every row to look
"changed").

### Mobile echo (pinned, ADR-30-5 detail)

- `contracts.AnimePatch` gains `Base *int64 \`json:"base,omitempty"\``. Pointer + `omitempty` so absent
  = old client (drives the backward-compat safe path, §6).
- `contracts.MobileAnime` gains `ModifiedAt int64 \`json:"modified_at"\`` so mobile advances its base
  after reading. Non-pointer: every snapshot has a token (default 0 for pre-migration rows, still a
  valid base for comparison).
- `contracts.PendingOperation.Payload` already carries arbitrary JSON; `decodePendingOperationPatch`
  (`sync_handler.go:123`) unmarshals it into `AnimePatch`, so `base` flows through with NO handler
  change beyond passing the decoded patch (which it already does).

### Watcher / catch-up stamping (pinned, ADR-30-3) — the exhaustive-stamping requirement

Every record the OBSERVE path writes to baseline must carry a freshly bumped `modified_at` IF its
content changed, and must PRESERVE the existing token if unchanged:

- In `DiffSnapshots` (`snapshot.go:44`): a record whose `Hash == baseline.Hash` is unchanged -> COPY
  `baseline.ModifiedAt` (no bump). A record that is new or hash-differs -> it is an observed change ->
  the token must be bumped.
- The bump uses the same `max(now, last+1)` rule against the baseline's prior token (0 for brand-new).
  This stamping is centralized in a single helper (`stampModifiedAt(prev int64, now func() time.Time)`)
  so both the mobile write path and the observe path share ONE monotonic generator — eliminating the
  "exhaustive stamping" risk (proposal risk #2) by construction: there is exactly one place a token is
  born.
- `ReplaceBaseline` (`anime_snapshot_store.go:48`) persists `modified_at` for every upserted row.

Because the observe path bumps the token whenever desktop content changes, the NEXT mobile write's
echoed base (the token mobile last read) will correctly NOT match -> divergence detected. A desktop
edit can never leave a stale token that silently passes a stale mobile write.

---

## 3. Detection seam placement (ADR-30-2)

### Decision: the OCC gate lives in `WriteService.PatchAnime` (service layer), NOT in the handler.

The handler (`applyPendingOperations`) only DECODES and forwards `base` via `AnimePatch`. The compare
happens in `PatchAnime` because:

1. `PatchAnime` ALREADY loads the current snapshot (`service.go:156`), so the current `modified_at` is
   in hand with zero extra reads. The handler would have to load it again — a redundant fetch and a
   layering smell (the handler doing domain reads).
2. The overwrite it must guard is at `service.go:166-189`. Guarding at the same layer as the write is
   the least-invasive, race-free placement (one load, one decision, one write).
3. Keeping the handler thin preserves its current testability and its reuse by the websocket handler
   (`websocket_handler.go:20` also holds a `PatchAnimeFunc`). Putting OCC logic in the handler would
   force duplicating it across both entry points; putting it in `PatchAnime` covers BOTH for free.

### The gate (pseudocode, inside `PatchAnime` after the unmarshal at line 164, before line 166)

```
current := raw                       // already unmarshaled from record.CanonicalJSON
desired := apply(patch, clone(raw))  // compute would-be result of the patch

switch {
case patch.Base == nil && record is a fresh create:
        // base=null on a record bridge does not have -> legitimate create
        applyAndStamp()
case patch.Base == nil && record exists:
        // old client, unverifiable base -> SAFE PATH: record conflict, do NOT silent-overwrite
        recordConflict(current, desired); notify(); return success (non-blocking)
case desired == current (value-equal):
        // no-op idempotency guard (#4298 item 3): blind retry w/ stale base is NOT a conflict
        return success (no write, no stamp)
case *patch.Base == record.ModifiedAt:
        // base==current -> fast-forward (decreases allowed = corrections OK)
        applyAndStamp()
default:
        // base!=current AND value differs -> DIVERGENCE
        recordConflict(current, desired); notify(); return success (non-blocking)
}
```

`applyAndStamp()` = the existing merge (lines 166-189) + `raw`-level stamp is NOT used; instead the
token is stamped on the `SnapshotRecord` in `updateConfirmedSnapshot` (`service.go:211-229`) via
`stampModifiedAt(record.ModifiedAt, s.now)`. `RequestWrite` writes the canonical JSON to `animes.dat`
(token excluded — bridge-private); `updateConfirmedSnapshot` persists the bumped token to the snapshot
row. NOTE: the self-echo of the bridge's own write through the watcher must NOT re-bump (the
`SelfEchoRegistry`, `watcher.go:43`, already suppresses self-echo; the unchanged-hash COPY rule in §2
also protects it).

`value-equal` comparison: compare the canonical JSON of `desired` vs `current` (`raw.MarshalJSON()`),
the same canonicalization `parser.go:84` and `service.go:191` already use — robust to field ordering.

---

## 4. Conflict writer + notifier wiring (ADR-30-4)

### `InsertConflict` signature

```go
// internal/sync/conflict_store.go
func (s *ConflictStore) InsertConflict(ctx context.Context, c contracts.ConflictRecord) error
```

where the input is a small DTO (declared in contracts so the anime package can build it without
importing `internal/sync`):

```go
// internal/api/contracts/contracts.go
type ConflictRecord struct {
    ConflictID         string  // uuid/ksuid generated by the writer's IDFunc
    AnimeID            string
    LocalSnapshotJSON  []byte  // bridge CURRENT value (what mobile would have clobbered)
    RemoteSnapshotJSON []byte  // mobile's DESIRED value (the divergent incoming write)
    DetectedAtMs       int64
}
```

INSERT populates `conflict_id, anime_id, local_snapshot_json, remote_snapshot_json, detected_at_ms,
status='pending'` — `resolved_at_ms`/`resolution` left NULL (the existing `ResolveConflict`,
`conflict_store.go:46`, fills them). Naming: `local` = bridge-confirmed current state, `remote` =
incoming mobile desired state. Documented in code so resolution UX reads them unambiguously.

### Lifecycle

`pending` (on INSERT) -> `resolved` (via existing `ResolveConflict`). No new states. `ListConflicts`
already filters `status='pending'` (`conflict_store.go:24`). The write path does NOT block on, retry,
or de-dupe conflict rows beyond the no-op value-equal guard — repeated stale writes for the same anime
MAY produce multiple pending rows; that is acceptable per #4298 (non-blocking, human-resolved) and
keeps the writer trivial. (A dedupe-by-(anime_id,remote_hash) optimization is explicitly OUT — note as
future, do not build.)

### Exposing both values to mobile (resolved sub-question (d))

Decision: **extend `ConflictInfo` + `ListConflicts` to expose both snapshots.** The resolution UX is
out of scope, but the data the UX needs is the bridge's job to expose (proposal §DB-3). Add to
`ConflictInfo`:

```go
LocalSnapshotJSON  json.RawMessage `json:"local_snapshot,omitempty"`
RemoteSnapshotJSON json.RawMessage `json:"remote_snapshot,omitempty"`
```

`ListConflicts` SELECT widens to include the two columns (additive; old field order preserved). This is
backward-compatible: clients ignoring the new fields are unaffected.

### Notifier injection seam

Mirror `RuntimeWatcherConfig.Notifier` (`watcher.go:49-53`) and `download.ServiceDeps.Notifier`. Two
new optional ports on `WriteService` (passed via a deps struct or setters — pin to a `WriteServiceDeps`
struct for consistency with download's ServiceDeps, but keep `NewWriteService(store, writer)` working
by defaulting deps to nil no-ops to avoid breaking existing callers/tests):

```go
type ConflictWriter interface {
    InsertConflict(ctx context.Context, c contracts.ConflictRecord) error
}
// WriteService gains: conflicts ConflictWriter (nil = skip), notifier notification.Notifier (nil = no-op)
```

`app.go` wires `conflicts = sync.NewConflictStore(db)` and `notifier = a.notifier` into the
`WriteService` the same way it wires download deps. **Failure isolation (MANDATORY, strict-TDD rule):**
the OCC write MUST NOT fail or block because conflict-record INSERT or Notify errored. On
`InsertConflict` error: log via shared logger, still return success to mobile (the write was
non-blocking by design; losing a conflict row must not lose the user's write or wedge sync). On
`Notify` error: ignore (the Dispatcher already isolates per-adapter failures, `notifier.go` doc). The
Notify fires AFTER a successful INSERT, with `Notification{Source:"sync", Level:warning, Title/Body
describing the conflicted anime}`. This is the exact seam SDD-29 catalog row #2 deferred.

---

## 5. Soft-delete fix (ADR-30-3b)

### Where the prune happens today

1. `parser.go:50-51,75-77`: a `$$deleted` tombstone line parses to an empty `SnapshotRecord{AnimeID}`
   and triggers `delete(records, record.AnimeID)` — the record vanishes from the parsed map.
2. `DiffSnapshots` (`snapshot.go:60-67`): any baseline id absent from `current` becomes a `pruneID`.
3. `ReplaceBaseline` (`anime_snapshot_store.go:48`, called at `startup_catchup.go:209` and
   `watcher.go:282`) PHYSICALLY deletes the pruned rows.

### Decision: convert prune-on-absence into LOGICAL delete; never hard-DELETE anime data.

- **Parser**: a `$$deleted` line MUST NOT remove the record. Instead it yields a tombstone-marked
  `SnapshotRecord` (carry a `Deleted bool` on `SnapshotRecord`, or synthesize a canonical payload with
  `Activo=0` + `FechaEliminacion=now`). Pin: synthesize the logical-delete payload at the parser by
  taking the LAST known canonical JSON for that id... — BUT the parser is stateless w.r.t. baseline.
  Therefore the conversion happens in the DIFF/baseline layer where baseline IS available:
- **`DiffSnapshots`**: for a baseline id absent from current (or marked tombstone), do NOT emit a
  `pruneID`. Instead emit an UPDATE event whose payload is the baseline's canonical JSON with
  `Activo` set to 0 (false) and `FechaEliminacion` set to the stamp time, using the existing domain
  fields (`anime_raw.go:18` `Activo LegacyBoolField`, `:23` `FechaEliminacion LegacyDateField`). The
  row is RETAINED in baseline with a bumped `modified_at`.
- **`ReplaceBaseline`**: stop passing prune IDs for `$$deleted`/absent records. (`pruneIDs` stays in
  the signature for genuine, intentional removals if any exist — but the `$$deleted`/absent-from-file
  path no longer feeds it. In practice this means catch-up/watcher pass `nil` prune for these.)

This is strictly MORE conservative than today (retains rows), so it cannot lose data a rollback would
need. Downstream readers already honor logical delete: `mobile.go:30` maps `FechaEliminacion`, the
`Activo` tri-state is already surfaced (`mobile.go:22`, `service.go:59-60` EffectiveAnime), so a
soft-deleted anime carries `activo=0` + a `fechaEliminacion` to the mobile contract instead of
silently disappearing. **Real-fixture validation is mandatory**: tests assert that a `$$deleted` line
in a file derived from `resources/autoreas-data/animes.dat` results in `Activo=0` + `FechaEliminacion`
set and the row PRESENT (not pruned), matching legacy soft-delete semantics.

Risk pinned: confirm no downstream path treats `Activo=0` rows as "must surface in active list" — the
existing `EffectiveAnime.Activo` and mobile mapping already distinguish; the test suite must assert no
ghost active rows appear.

---

## 6. Backward-compat + no-op guard (ADR-30-5)

| Incoming | Bridge behavior |
|----------|-----------------|
| `base` present, `== current.modified_at` | fast-forward apply + stamp |
| `base` present, `!= current`, value differs | divergence -> InsertConflict + Notify, return success |
| `base` present, value already `== current` | no-op success (idempotency guard, #4298 item 3) |
| `base == nil` (absent), record does NOT exist | legitimate create -> apply + stamp |
| `base == nil` (absent), record EXISTS (old client) | safe path -> InsertConflict + Notify, never silent-overwrite |

`base` is `*int64` + `omitempty` -> distinguishes "old client sent nothing" (`nil`) from "client based
on token 0". A reverted bridge ignores the unknown `base` field on the wire and falls back to
last-call-wins — confirming rollback safety.

**Optional staged-rollout lever (recommended, from proposal §rollback):** a boolean
`OCCObserveOnly` flag on `WriteServiceDeps`. When true, the gate LOGS the would-be conflict and still
applies last-call-wins (no INSERT, no Notify) — lets production observe conflict volume before
enforcing. Default false (full enforcement). This is a cheap, removable lever; include it.

---

## 7. Migration plan (column-introspection `ensureXSchema`)

Follow the verified `ensureChangelogSchema` / `ensureDownloadJDConfigSchema` precedent
(`sqlite_bootstrap.go:300,235`). `anime_snapshots` is currently created with a bare `db.Exec(DDL)` at
`sqlite_bootstrap.go:194`. Replace that call with a new `ensureAnimeSnapshotsSchema(db)`:

```
ensureAnimeSnapshotsSchema(db):
    cols := tableColumns(db, "anime_snapshots")
    if len(cols)==0:                         -> Exec(animeSnapshotsDDL)  // fresh, includes modified_at
    else if has(cols, "modified_at"):        -> nil  // already migrated
    else if isLegacyAnimeSnapshotsSchema(cols) (anime_id,snapshot_json,snapshot_hash):
        ALTER TABLE anime_snapshots ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0
    else: return error("unsupported anime_snapshots schema columns")
```

`ADD COLUMN ... DEFAULT 0` is the SAFE in-place case (pure additive, no data rewrite, modernc.org/sqlite
supports it) — the rename->create->copy->drop precedent (`migrateLegacyChangelogSchema:390`) is
reserved for RISKY changes (type/constraint changes); a nullable-defaulted additive column does not
need it. Pre-existing rows get `modified_at=0`, a valid starting base; the first accepted change on each
anime bumps to `max(now, 1)`.

**`conflicts` table**: DDL already has `local_snapshot_json`/`remote_snapshot_json`
(`sqlite_bootstrap.go:37-47`) — NO migration needed; the writer simply populates them. Keep the existing
`db.Exec(conflictsDDL)` at line 200 (idempotent `CREATE TABLE IF NOT EXISTS`).

**Soft-delete**: uses existing `Activo`/`FechaEliminacion` domain fields — NO schema change (data lives
in `snapshot_json`).

Migration ordering in `initializeBridgeDB`: swap line 194's bare exec for `ensureAnimeSnapshotsSchema`
before the other ensures (snapshots are the foundational table).

---

## 8. Sequence diagrams

### 8.1 OCC fast-forward (base == current)

```
Mobile          sync_handler            WriteService                 SnapshotStore
  │ PATCH(base=T)    │                       │                            │
  │─────────────────>│ decode -> AnimePatch  │                            │
  │                  │──────────────────────>│ GetSnapshot(id)            │
  │                  │                        │───────────────────────────>│ {json, hash, modified_at=T}
  │                  │                        │ base(T)==current(T) -> FF  │
  │                  │                        │ merge patch (decrease OK)  │
  │                  │                        │ stamp next=max(now,T+1)    │
  │                  │                        │ RequestWrite(animes.dat)   │
  │                  │                        │ ReplaceBaseline(modified_at=next)
  │                  │<───────────────────────│ ok                         │
  │<── 202 applied   │                        │                            │
```

### 8.2 Divergence -> non-blocking conflict + Notify (base != current)

```
Mobile          WriteService               ConflictWriter        Notifier        SnapshotStore
  │ PATCH(base=T)   │ GetSnapshot -> modified_at=T2 (T2!=T)        │               │
  │────────────────>│ desired != current                          │               │
  │                 │ InsertConflict{local=current, remote=desired}│               │
  │                 │────────────────────────────────────────────>│ pending row   │
  │                 │ (INSERT err -> log, still succeed)           │               │
  │                 │ Notify(source=sync, level=warning)──────────────────>│       │
  │                 │ (Notify err -> ignore; dispatcher isolates)  │               │
  │                 │ NO clobber of current (current retained)     │               │
  │<── 202 success  │ (mobile NEVER blocked)                       │               │
```

### 8.3 Desktop snapshot stamping (observe path)

```
animes.dat edit ─> watcher/catchup ─> parser ─> current map ─> DiffSnapshots(current, baseline)
                                                                  │ for each id:
                                                                  │  hash unchanged -> copy baseline.modified_at
                                                                  │  changed/new   -> stamp max(now, prev+1)
                                                                  └─> ReplaceBaseline(modified_at persisted)
   (next mobile write echoing the OLD token now mismatches -> divergence correctly detected)
```

### 8.4 Soft-delete ($$deleted / absent)

```
animes.dat: {"_id":"X","$$deleted":true}  ─> parser yields tombstone marker for X
DiffSnapshots(current, baseline):
   X in baseline, X tombstoned/absent in current
   -> NOT a pruneID
   -> emit UPDATE(payload = baseline.json with Activo=0, FechaEliminacion=now), bump modified_at
ReplaceBaseline(current incl. X soft-deleted, pruneIDs = nil)
   -> row RETAINED; mobile sees activo=0 + fechaEliminacion (no ghost, no data loss)
```

---

## 9. Testing strategy (strict TDD — every seam unit-testable with fakes)

1. **`modified_at` monotonicity** (`stampModifiedAt` unit): same-ms two calls -> strictly increasing;
   clock regression (`now` returns earlier than `prev`) -> clamps to `prev+1`; fresh (prev=0) ->
   `max(now,1)`. Pure function, injected `now`.
2. **OCC gate in `PatchAnime`** with fake store + fake ConflictWriter + fake Notifier:
   - base==current -> applies, no conflict, token bumped.
   - base!=current & value differs -> InsertConflict called once (assert local=current, remote=desired),
     Notify called once (source=sync, level=warning), write returns success, current NOT clobbered.
   - value-equal incoming -> no write, no conflict (no-op guard).
   - base=nil + missing record -> create, no conflict.
   - base=nil + existing record -> conflict recorded (safe path).
   - **failure isolation**: ConflictWriter returns error -> PatchAnime STILL returns success; Notifier
     returns error -> STILL success. (MANDATORY assertion per strict-TDD rule.)
   - OCCObserveOnly=true -> no INSERT/Notify, applies last-call-wins, logs.
3. **`InsertConflict`** against a real in-memory/bootstrapped SQLite: row present with both
   `*_snapshot_json` populated, status=pending; `ListConflicts` returns both snapshots in `ConflictInfo`.
4. **Migration** (`ensureAnimeSnapshotsSchema`): legacy 3-col table -> ADD COLUMN, existing rows get
   `modified_at=0`; fresh DB -> 4-col; unknown schema -> error. Round-trip GetSnapshot reads the token.
5. **Soft-delete with REAL fixture** (`resources/autoreas-data/animes.dat`): derive a file with a
   `$$deleted` line for a known id; assert after catch-up the row is PRESENT with `Activo=0` +
   `FechaEliminacion` set, NOT pruned; assert mobile mapping surfaces it as inactive; assert no ghost
   in the active set. Validates legacy soft-delete compatibility.
6. **Observe-path stamping** (`DiffSnapshots`): unchanged hash preserves token; changed/new bumps token
   monotonically; self-echo (SelfEchoRegistry) does not double-bump.
7. **Contract round-trip**: `AnimePatch.Base` decodes from `PendingOperation.Payload`; `MobileAnime`
   serializes `modified_at`; old-client payload (no `base`) decodes to `Base=nil`.

Failure-isolation discipline (Notify/InsertConflict errors never fail the write) is asserted, not
assumed — mirrors download/watcher SDD-28/29 tests.

---

## 10. Rollback

- **Code**: lands as ONE final commit (checksdd: zero `- [ ]`). Revert restores last-call-wins
  `PatchAnime` exactly (the gate, stamping, InsertConflict, notifier wiring all sit behind the sync
  write path). `OCCObserveOnly` provides a softer pre-revert lever (observe-only).
- **Schema**: `modified_at` is an additive `NOT NULL DEFAULT 0` column; old code does explicit-column
  `SELECT`s (`conflict_store.go:21`, snapshot store) so it ignores the new column. `conflicts` columns
  already existed. No destructive DROP. Soft-delete RETAINS rows -> strictly more conservative than the
  current prune; a rollback to hard-prune does not need data the new code preserved.
- **Contract**: `base`/`modified_at` are optional/additive on the wire; a reverted bridge ignores
  `base` (-> last-call-wins) and stops sending `modified_at` (mobile keeps last known base harmlessly).
  Mobile sending `base` to an old bridge is a harmless unknown field.

---

## 11. ADR index

- **ADR-30-1** — `modified_at` = bridge-private, strictly-monotonic `max(now, last+1)` INTEGER column on
  `anime_snapshots`, surfaced as "modified date". Rejects plain counter (b: loses date), content hash
  (correction-to-prior-value false match; wrong primitive), hybrid (over-engineering).
- **ADR-30-2** — OCC gate in `WriteService.PatchAnime` (service layer), not the handler: snapshot
  already loaded, guards the write at its own layer, covers websocket entry point for free.
- **ADR-30-3** — token stamping centralized in one `stampModifiedAt` helper shared by write + observe
  paths; observe path bumps on content change, copies on unchanged hash (exhaustive by construction).
- **ADR-30-3b** — soft-delete: convert `$$deleted`/absent prune into `Activo=0`+`FechaEliminacion`
  logical delete in `DiffSnapshots`, retain row; validate against real `animes.dat`.
- **ADR-30-4** — `InsertConflict(ctx, contracts.ConflictRecord)` populating both `*_snapshot_json`;
  extend `ConflictInfo`/`ListConflicts` to expose both; notifier injected via deps; failure isolation
  mandatory (conflict/Notify errors never fail the write).
- **ADR-30-5** — mobile contract: `AnimePatch.Base *int64` (omitempty -> old-client detection),
  `MobileAnime.ModifiedAt int64` echo; backward-compat safe path; optional `OCCObserveOnly` staged lever.
