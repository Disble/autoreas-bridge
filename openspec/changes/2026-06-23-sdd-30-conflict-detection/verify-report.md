# Verify Report: SDD-30 Sync Conflict Detection

- Change: `2026-06-23-sdd-30-conflict-detection`
- Verified by: orchestrating agent (final verification, not delegated — per AGENTS.md rule 3)
- Date: 2026-06-23

## Scope verified

Non-blocking optimistic-concurrency (OCC) sync conflict detection, built on a
bridge-owned per-anime `modified_at` version token, plus soft-delete correctness
and a conflict-row writer. Implemented across 4 capabilities; all 41 tasks are
complete and `[x]` in `tasks.md` (6.6 is this report).

- **anime-modified-at** — bridge-owned strictly-monotonic `modified_at`
  (`stampModifiedAt(prev, now) = next:=now_ms; if next<=prev {next=prev+1}`),
  defeating both same-ms collision and clock regression (ADR-30-1). New
  `anime_snapshots.modified_at` column via `ensureAnimeSnapshotsSchema`
  column-introspection migration (additive `ALTER TABLE … ADD COLUMN … DEFAULT 0`).
  Stamped centrally in `DiffSnapshots` (copy on unchanged hash, bump on
  new/changed) + `updateConfirmedSnapshot`, persisted/scanned by `ReplaceBaseline`.
- **anime-soft-delete** — a baseline id absent from the latest parse (`$$deleted`
  tombstone or vanish) is NO LONGER physically pruned; `DiffSnapshots` synthesizes
  an `Activo=0` + `FechaEliminacion` UPDATE from the last-known canonical payload,
  retaining the row (ADR-30-3b). No data loss.
- **sync-conflict-detection** — OCC gate in `PatchAnime`: `base==current` →
  fast-forward (decreases allowed); `incoming==current` → no-op; `base=nil`+new →
  create; `base=nil`+exists+differs → safe non-blocking conflict; `base!=current`
  → non-blocking conflict. The write ALWAYS returns success (never blocks/clobbers
  mobile); current snapshot left untouched on divergence (ADR-30-2). `OCCObserveOnly`
  staged-rollout lever (logs + last-call-wins, no INSERT/Notify) present.
- **sync-conflict-storage** — `ConflictStore.InsertConflict` persists BOTH divergent
  values into the pre-existing `local_snapshot_json`/`remote_snapshot_json` columns;
  `ListConflicts`/`ConflictInfo` widened to expose them (ADR-30-4).

**Closes the SDD-29 deferred sync notification:** on divergence, `reportConflict`
calls `InsertConflict` then `Notify(Title:"Sync conflict detected", Level:warning,
Source:"sync", CorrelationID:id, Timestamp set)` — both with MANDATORY failure
isolation (neither error fails nor blocks the write). Wired at the `app.go`
composition root via `WriteService.SetDeps` (mirrors `download.ServiceDeps.Notifier`).

## Gate results (run by the orchestrator)

- `go build ./...` — clean
- `go vet ./...` — clean
- `go test ./...` — all packages pass (anime, sync, api, api/handlers, …)
- `go run ./tools/checkgofmt` — passed
- `golangci-lint run` — clean, exit 0
- `go run ./tools/checkopenapi` — passed (doc updated: `base` on PATCH request,
  `modified_at` on Anime, both snapshot fields on ConflictInfo)
- **Real-fixture soft-delete** — `TestStartupCoordinatorCatchUpSoftDeletesRealFixtureTombstone`
  PASS against `resources/autoreas-data/animes.dat` (fixture byte-identity preserved;
  tombstoned row retained with `Activo=0`+`FechaEliminacion`, not pruned).
- Mobile contract: `AnimePatch.Base *int64` + `MobileAnime.ModifiedAt int64`;
  `decodePendingOperationPatch` round-trips `base` with zero handler-level OCC logic.
- Frontend: untouched (`git status` clean for `frontend/`).

The stale IDE "undefined" diagnostics (`ensureAnimeSnapshotsSchema`, `InsertConflict`,
`MobileAnime.ModifiedAt`) were RED-phase artifacts; all three symbols are present on
disk and the gates above are green — verified directly, not assumed.

## Warnings (PASS WITH WARNINGS rationale)

- **`go test -race` cannot run in this Windows dev environment** — a pre-existing,
  repo-wide cgo toolchain issue (`go env CC`/`CXX` point to an MSVC path containing
  spaces). This affects the whole repo, not SDD-30 code; the non-race run of the
  failure-isolation tests passes. The lefthook pre-commit gate runs `go test ./...`
  WITHOUT `-race`, so the commit is not blocked. Environment gap, not a code gap.
- **Mobile contract adoption required for full protection:** the `base` echo +
  backward-compat safe path only protect once mobile sends `base`. Old clients fall
  to the safe non-blocking-conflict path (never silent-overwrite). Client-side
  follow-up, not a bridge defect.
- **`OCCObserveOnly` defaults to false (full enforcement).** Operators may flip it
  on first to observe conflict-row volume before enforcing — recommended for rollout.
- **No conflict-row dedupe** — accepted per decision #4298 (non-blocking,
  human-resolved).

## Notes / out of scope (unchanged)

Conflict-resolution UX (mobile-side; bridge only records + exposes via
ListConflicts/ResolveConflict), removal of the dead CRDT-MAX `Reconcile()` code,
idempotency keys, device-ownership rules, and the "reconcile failed" notification
(SDD-29 row #3) are explicitly NOT in this change.

### Verdict

PASS WITH WARNINGS
