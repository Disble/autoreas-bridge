# SDD-30 — Sync Conflict Detection (non-blocking OCC, soft-delete, conflict storage)

Status: proposed
Change: 2026-06-23-sdd-30-conflict-detection
Artifact store: hybrid (this file + engram `sdd/2026-06-23-sdd-30-conflict-detection/proposal`)

> The conflict model is ALREADY DECIDED (engram decision #4298). This proposal FORMALIZES that
> decision against the code — it does not relitigate it. Where the exploration (#4296) recommended
> "do not build", the user overrode it with the OCC model below; that override is binding.

## Why / Intent

### The problem
Mobile and the legacy desktop app both mutate the same anime catalog. The bridge sits between them:
mobile writes through the REST sync path (`PATCH`/pending operations), desktop writes by editing
`animes.dat`, which the bridge observes as **file snapshots**. Today the mobile write path
(`applyPendingOperations` -> `PatchAnime`) is **last-call-wins**: it loads the bridge's confirmed
snapshot and unconditionally overwrites `Estado`, `NroCapVisto`, `Dias`, `FechaUltCapVisto`
(`internal/anime/service.go:166-189`). There is no comparison against what mobile *believed* it was
editing, so a stale mobile write silently clobbers a newer desktop/bridge value. The `conflicts`
table is a read/resolve stub with **no writer** (`internal/sync/conflict_store.go` has only
`ListConflicts`/`ResolveConflict`; zero `INSERT INTO conflicts` anywhere), and SDD-29 deferred the
"sync conflict detected" notification precisely because no detection seam fired at runtime.

### The asymmetry (why this is not a symmetric two-peer merge)
Sync is **asymmetric**. Mobile OWNS its contract and can echo metadata back to the bridge. Desktop is
a legacy black box: it only emits *states* into `animes.dat`; the bridge can never recover desktop's
*intent*, only observe the resulting file. So the bridge cannot ask both sides "what did you base
your edit on?" — only mobile can answer.

### The paradox the OCC token resolves
Sync is **state-based**: mobile sends absolute values (`NroCapVisto = 12`), not deltas. With only
`value + timestamp`, a legitimate *correction* (user fixes a double-tap, 13 -> 12) and a *stale
overwrite* (mobile had an old base and pushes 12 over a newer 13) are **indistinguishable** — same
value, same shape. Timestamp alone cannot tell them apart; this is the irreducible lost-update
paradox. The missing bit is **WHAT STATE the edit was based on**. We add it as a per-anime
**version token** (a bridge-owned modified-date, `modified_at`) that mobile echoes as its *base*.
`base == current` -> the editor saw the latest state -> **fast-forward apply** (decreases are fine,
corrections are legitimate). `base != current` -> the editor edited from a divergent base ->
**divergence detected** -> record a conflict. This is the git/ETag/If-Match optimistic-concurrency
model.

### What success looks like
- Mobile writes from a current base apply cleanly; corrections (decreases) still work.
- A stale mobile write NEVER silently clobbers a newer value: the bridge accepts it, preserves BOTH
  versions, records a conflict row, and fires the notification — mobile is never blocked.
- Animes are never physically lost: deletes are logical (`Activo=0` + `FechaEliminacion`).
- The SDD-29 deferred "sync conflict detected" notification is closed at a real runtime seam.

## Conflict model (formalized from #4298 — binding)

- **Definition.** A conflict = same anime + concurrently divergent base. NOT "both sides changed
  something" — only a write whose echoed base does not match the bridge's current version token.
- **Version token (OCC).** A per-anime bridge-stamped `modified_at`. The bridge OWNS it and stamps it
  on EVERY change it accepts — mobile writes AND desktop-observed snapshot changes (the file-watcher /
  startup catch-up path). Mobile echoes the `modified_at` it last saw as the `base` of each write.
- **Detection rule (state-based, asymmetric, non-blocking — Syncthing model):**
  - `base == current` -> **fast-forward**: apply the absolute value (decreases allowed).
  - incoming desired value already `== current` value -> **no-op success** (trivial idempotency guard;
    handles a blind retry with a stale base so it is not mis-flagged as a conflict — #4298 item 3).
  - `base != current` AND incoming value differs from current -> **divergence**: ACCEPT without
    clobbering (preserve both), INSERT a conflict row holding BOTH divergent values, and
    `Notify(Source:"sync", Level:warning)`. Mobile is never rejected, never blocked.
  - `base == null` on a record the bridge does not have -> legitimate **create**, not a conflict.
  - `base == null` (or missing) on an EXISTING record (old client) -> base is unverifiable -> take the
    **safe path** (record a conflict / do not silent-apply over a value we cannot prove is stale).
    Never silently overwrite on an unverifiable base.
- **No ownership rule.** No device-owns-field policy (management will eventually migrate fully to the
  bridge; encoding "desktop owns metadata / mobile owns progress" hardcodes a soon-to-be-false
  assumption). The OCC gate keeps conflicts naturally rare without it.
- **No idempotency key, no MAX rule, no delta/operation sync.** Absolute-value writes are idempotent
  by nature; a chapter can legitimately decrease; the CRDT-MAX `Reconcile()` is dead code.
- **Human resolution.** Conflicts are resolved by a human via the existing
  `contracts.ConflictService.ResolveConflict`. The bridge only RECORDS and EXPOSES (via
  `ListConflicts`); the resolution UX is mobile-side and OUT of scope here.

## Detection & write seams (file:line)

1. **OCC base-check + conflict recording — primary seam.**
   `internal/api/handlers/sync_handler.go::applyPendingOperations` (lines 82-102), before
   `applyPendingPatch` at line 96, AND/OR inside `internal/anime/service.go::PatchAnime`
   (lines 155-209) which is the actual write. The check compares the operation's echoed `base`
   modified_at against the current snapshot's `modified_at` (already loaded via `store.GetSnapshot`
   at `service.go:156`). The exact placement (handler pre-check vs. service-layer) is a DESIGN
   decision — the model only requires the check happen before the unconditional overwrite at
   `service.go:166-189`.
2. **Bridge-owned `modified_at` stamping.**
   - Mobile-accepted writes: stamp on the merged record in `PatchAnime` before
     `RequestWrite`/`updateConfirmedSnapshot` (`service.go:191-206`).
   - Desktop-observed snapshot changes: stamp where the bridge ingests file deltas
     (`internal/anime/snapshot.go::DiffSnapshots` + the catch-up/baseline path,
     `startup_catchup.go:196-212`). The bridge must own the token even for changes it merely observes.
3. **Conflict WRITER + notifier wiring.**
   New `ConflictStore.InsertConflict(ctx, ...)` (does not exist today — `conflict_store.go`) plus a
   `Notifier` dependency threaded into the sync write path. The `Notifier` port is ready
   (`internal/notification/notifier.go`); `app.go` already constructs `a.notifier` early so
   dependents capture it by value — inject it the same way `RuntimeWatcherConfig.Notifier` is.
   `Notify(Source:"sync", Level:warning)` fires at the INSERT seam -> closes SDD-29 catalog row #2.

## DB schema changes (in scope — user bundled the DB work here)

All via the established `ensureXSchema` column-introspection migration pattern
(`internal/sync/sqlite_bootstrap.go`), DDL in `sqlite_bootstrap.go`, pure-Go SQLite. No in-place
`ALTER` for risky changes — use the rename->create->copy->drop precedent
(`migrateLegacyChangelogSchema`).

1. **Per-anime `modified_at` (the OCC version token).**
   The model lacks a bridge-owned modified-date. Add it as a tracked column on `anime_snapshots`
   (today only `anime_id, snapshot_json, snapshot_hash` — `sqlite_bootstrap.go:21-26`) OR as a field
   threaded through the snapshot record, so the bridge can stamp and compare it. DESIGN pins the exact
   storage (column vs. derived) and the migration. NOTE: `LegacyAnimeRaw.StampServerTimestamp`
   currently reuses `FechaUltCapVisto` (`anime_raw.go:527-529`) — that is a domain field with its own
   meaning and MUST NOT be conflated with the OCC token. `modified_at` is a NEW, bridge-private token.
2. **Soft-delete correctness (never lose data).**
   The domain already models logical delete (`Activo` LegacyBoolField + `FechaEliminacion`
   LegacyDateField in `anime_raw.go`), but the snapshot ingest path bypasses it: a `$$deleted`
   tombstone line is parsed to an empty record and `delete(records, ...)`'d
   (`parser.go:50-51,75-77`); that record then becomes a `pruneID` in `DiffSnapshots`
   (`snapshot.go:60-77`) and is PHYSICALLY removed via `ReplaceBaseline`
   (`startup_catchup.go:196-212`). Fix: convert prune-on-absence / `$$deleted` into a LOGICAL delete
   (set `Activo=0` + `FechaEliminacion`, retain the row) instead of a hard `DELETE`. Preserve data.
3. **Conflict storage able to hold BOTH divergent values.**
   The `conflicts` table DDL already declares `local_snapshot_json` + `remote_snapshot_json`
   (`sqlite_bootstrap.go:37-47`), so it CAN hold both versions — but no code ever writes them, and
   `ListConflicts` only reads `conflict_id, anime_id, detected_at_ms, status` (`conflict_store.go:22`)
   while `contracts.ConflictInfo` exposes only those four fields (`contracts.go:112-117`). In scope:
   the `InsertConflict` writer that populates both `*_snapshot_json` columns; DESIGN decides whether
   `ConflictInfo`/`ListConflicts` are extended to expose both values to mobile (the resolution UX is
   out of scope, but EXPOSING the data the UX needs is the bridge's job).

## Mobile contract change + backward compatibility

- **New.** Mobile sends a per-anime `base` modified_at on each write (the `modified_at` it last
  observed for that anime). Pending-operation payloads / `AnimePatch` carry it. The bridge echoes the
  authoritative `modified_at` back so mobile can advance its base (likely on `MobileAnime` /
  `ReconcileResponse`; DESIGN pins the exact wire fields).
- **Backward compat (old clients without `base`):**
  - `base` absent on a NEW record -> legitimate create.
  - `base` absent on an EXISTING record -> safe path (record a conflict; do NOT silent-apply over an
    unverifiable base). Old clients keep working; they just can never silently lose-update a newer
    bridge value — at worst they generate a conflict for human resolution.

## How this closes SDD-29

SDD-29 shipped device-pairing-success + watcher-terminal-failure + the log-forward adapter but
DEFERRED "sync conflict detected" because the `conflicts` table had no writer and no runtime
detection seam existed. SDD-30 creates exactly that seam: `InsertConflict` + the OCC base-check in the
sync write path, with `Notify(Source:"sync", Level:warning)` fired at the INSERT. That is the precise
event SDD-29's catalog row #2 specified. SDD-30 produces it; SDD-29's deferral is closed.

## Affected modules / packages

- `internal/sync/conflict_store.go` — add `InsertConflict`; possibly enrich `ListConflicts`.
- `internal/sync/sqlite_bootstrap.go` — `modified_at` storage + migration; soft-delete schema impact.
- `internal/api/handlers/sync_handler.go` — OCC base-check seam in `applyPendingOperations`; thread
  notifier/conflict-store deps through `SyncHandlerConfig`.
- `internal/anime/service.go` — `PatchAnime` base-compare + `modified_at` stamping before overwrite.
- `internal/anime/snapshot.go` + `internal/anime/startup_catchup.go` + `internal/anime/parser.go` —
  stamp `modified_at` on observed snapshot changes; convert `$$deleted`/prune to logical delete.
- `internal/anime/domain/anime_raw.go` — keep `Activo`/`FechaEliminacion` as the logical-delete carrier;
  do NOT overload `StampServerTimestamp`/`FechaUltCapVisto` as the OCC token.
- `internal/anime/mobile.go` + `internal/api/contracts/contracts.go` — `MobileAnime`/`AnimePatch`/
  `PendingOperation`/`ReconcileResponse`/`ConflictInfo` contract additions (base echo + token + both
  conflict values).
- `internal/notification/notifier.go` + `app.go` — inject notifier into the sync write path
  (existing pattern).

## Risks

- **`modified_at` collision / clock regression** (FORWARDED to DESIGN, not solved here): a wall-clock
  date can collide at same-ms or regress if the system clock moves backward, breaking `base==current`
  equality. DESIGN must pin whether a **monotonic counter** backs the date (monotonic int vs.
  content hash vs. counter+date hybrid).
- **Token ownership for desktop-observed changes**: the bridge must stamp `modified_at` on every
  observed file delta, or a desktop edit will leave a stale token and mis-flag the next mobile write
  as a conflict. The stamping seam in the watcher/catch-up path must be exhaustive.
- **Soft-delete vs. legacy semantics**: stopping the physical prune changes long-standing behavior;
  must confirm downstream readers (mobile list, sync) honor `Activo=0`/`FechaEliminacion` and do not
  surface ghost rows. Real-fixture validation with `resources/autoreas-data/animes.dat`.
- **Conflict-row volume**: with no ownership rule the conflict set is larger; the OCC gate keeps it
  rare, but old clients (no `base`) on existing records could generate conflicts more often. Acceptable
  per #4298 (non-blocking, human-resolved), but worth monitoring.
- **Contract migration**: mobile must adopt the `base` echo; staged rollout relies on the
  backward-compat safe path holding for old clients.

## Drift recorded (code wins as truth — NOT bundled here unless trivial)

- `internal/sync/reconcile.go` (CRDT-MAX `Reconcile`) is DEAD CODE — never called in production (only
  its own tests). Removal is a SEPARATE cleanup, noted not bundled.
- `LegacyAnimeRaw.StampServerTimestamp` overloads `FechaUltCapVisto` as a "server timestamp"
  (`anime_raw.go:527-529`); this must not be confused with the new OCC `modified_at`.
- SDD-16 archived proposal scoped conflict-row production out; SDD-29 deferred the notification. Both
  are superseded by THIS change.

## Out of scope (explicit)

- The conflict-RESOLUTION UX (mobile-side). The bridge only records + exposes via existing
  `ListConflicts`/`ResolveConflict`.
- Removing the dead CRDT-MAX `Reconcile()` (separate cleanup; noted as drift above).
- Idempotency keys, device-ownership rules, operation/delta-based sync (all rejected in #4298).
- "Reconcile failed" notification (SDD-29 catalog row #3) — no honest bridge-owned terminal-failure
  seam exists; not in this change.

## Rollback plan

- **Code**: the change lands as ONE final commit (checksdd: zero `- [ ]`). Rollback = revert that
  commit. The OCC base-check, `InsertConflict`, notifier wiring, and `modified_at` stamping all sit
  behind the sync write path; reverting restores last-call-wins `PatchAnime` exactly as today.
- **Schema**: migrations are additive (new `modified_at` storage, conflict columns already exist,
  soft-delete uses existing `Activo`/`FechaEliminacion`). The `ensureXSchema` introspection pattern
  tolerates a DB created by the new code being read by old code IF additions are additive — DESIGN
  must guarantee old code ignores unknown columns (modernc.org/sqlite + `SELECT` explicit columns
  already does this). No destructive DROP of existing data; soft-delete is strictly MORE conservative
  than the current prune (it RETAINS rows), so a rollback does not lose data already preserved.
- **Contract**: the `base` field is optional on the wire; reverting the bridge makes it ignore `base`
  and fall back to last-call-wins. Mobile sending `base` to an old bridge is harmless (unknown field).
- **Risk-gated**: if the OCC check proves too aggressive (excess conflict rows), the base-check can be
  feature-gated to log-and-apply (observe-only) before full enforcement — DESIGN may add this as a
  staged-rollout lever.
