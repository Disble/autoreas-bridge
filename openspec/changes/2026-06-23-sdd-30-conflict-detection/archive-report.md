# Archive Report: SDD-30 Sync Conflict Detection

**Change**: `2026-06-23-sdd-30-conflict-detection`
**Archived on**: 2026-06-23
**Commit**: `7cb6988 feat(sync): non-blocking OCC conflict detection + soft-delete (SDD-30)`
**Final Verdict**: PASS WITH WARNINGS

## Summary

Replaced silent last-write-wins on the mobile sync write path with non-blocking
optimistic-concurrency (OCC) conflict detection, built on a bridge-owned per-anime
`modified_at` version token, plus soft-delete correctness and a conflict-row
writer. Divergent concurrent edits are now detected, BOTH versions preserved, and
the user notified — closing the SDD-29 deferred "sync conflict detected"
notification at last.

This SDD was designed through an extended architecture dialogue with the user that
rejected several wrong turns (CRDT-MAX — also found to be dead code; device
ownership; idempotency keys) and landed on: OCC via a monotonic version token,
non-blocking conflict recording (Syncthing model), no ownership, human-resolved
conflicts, and soft-delete-only (never lose data).

## What shipped (4 capabilities)

1. **anime-modified-at** — bridge-owned strictly-monotonic OCC token
   `stampModifiedAt(prev, now) = max(now_ms, prev+1)` (ADR-30-1), defeating same-ms
   collision and clock regression. New `anime_snapshots.modified_at` column via
   `ensureAnimeSnapshotsSchema` additive column-introspection migration. Stamped
   centrally in `DiffSnapshots` (copy on unchanged hash, bump on change),
   `updateConfirmedSnapshot`, persisted/scanned by `ReplaceBaseline`.
2. **anime-soft-delete** — a baseline id absent from the latest parse (`$$deleted`
   tombstone / vanish) is no longer physically pruned; converted to `Activo=0` +
   `FechaEliminacion` (ADR-30-3b). No data loss. Validated against the real
   `animes.dat` fixture.
3. **sync-conflict-detection** — OCC gate in `PatchAnime` (ADR-30-2): `base==current`
   fast-forwards (decreases allowed), `incoming==current` no-ops, `base=nil`+new
   creates, divergence records a NON-BLOCKING conflict (always accepts, never
   clobbers/blocks mobile, current snapshot untouched). `OCCObserveOnly` staged-
   rollout lever.
4. **sync-conflict-storage** — `ConflictStore.InsertConflict` persists BOTH divergent
   values into the pre-existing `local_snapshot_json`/`remote_snapshot_json` columns;
   `ListConflicts`/`ConflictInfo` widened (ADR-30-4). On divergence the write fires
   `Notify(Source:"sync", Level:warning, "Sync conflict detected")` with mandatory
   failure isolation → **closes the SDD-29 sync notification**.

## Specs synced (source of truth)

| Capability | Synced to |
|---|---|
| anime-modified-at | `openspec/specs/anime/modified-at.md` |
| anime-soft-delete | `openspec/specs/anime/soft-delete.md` |
| sync-conflict-detection | `openspec/specs/sync-conflicts/detection.md` |
| sync-conflict-storage | `openspec/specs/sync-conflicts/storage.md` |

## Archive contents

| Artifact | Status |
|---|---|
| proposal.md | ✅ |
| design.md | ✅ (ADR-30-1..5 + sequence diagrams) |
| specs/ | ✅ (4 delta specs, all synced) |
| tasks.md | ✅ (41 tasks, all `[x]`) |
| verify-report.md | ✅ PASS WITH WARNINGS |
| archive-report.md | ✅ |

## Verification & quality (orchestrator-run)

`go build`/`vet`/`test ./...` clean; `checkgofmt`; `golangci-lint` exit 0;
`checkopenapi` passed; real-fixture soft-delete test PASS against `animes.dat`;
full lefthook pre-commit gate green at commit. Stale IDE "undefined" diagnostics
were RED-phase artifacts (symbols verified present on disk).

## Drift recorded (code wins as truth)

- The CRDT-MAX `Reconcile()` engine (SDD-08) is DEAD CODE — never called in
  production; the real path was last-write-wins via `PatchAnime`. SDD-30 supersedes
  that path with OCC. Removing the dead `Reconcile()` code is a separate cleanup
  (out of scope here).
- The `$$deleted` physical prune (pre-SDD-30) silently lost rows — fixed by
  soft-delete.

## Known limitations / follow-ups

- **Mobile contract adoption**: full protection needs mobile to echo `base`; old
  clients fall to the safe non-blocking-conflict path (never silent-overwrite).
- **Conflict-resolution UX** is mobile-side (bridge records + exposes only).
- **No conflict-row dedupe** (accepted, non-blocking/human-resolved).
- `OCCObserveOnly` recommended ON first for staged rollout to observe volume.

## SDD Cycle Complete

Explored, proposed, specified (4 capabilities), designed (5 ADRs + diagrams),
tasked (41), implemented (strict TDD), verified (PASS WITH WARNINGS,
orchestrator-run), and archived. Closes the SDD-29 sync-conflict notification loop.
