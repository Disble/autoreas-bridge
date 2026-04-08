# Verify Report: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

**Date**: 2026-04-08
**Verified by**: orchestrator (not delegated)

### Verdict
PASS

## Test Results

```
ok  autoreas-bridge                     0.197s  coverage: 60.0%
ok  autoreas-bridge/internal/anime      2.023s  coverage: 79.4%
ok  autoreas-bridge/internal/anime/domain 1.269s coverage: 77.6%
ok  autoreas-bridge/internal/api        1.443s  coverage: 47.9%
ok  autoreas-bridge/internal/api/handlers 1.411s coverage: 75.0%
ok  autoreas-bridge/internal/device     1.603s  coverage: 60.5%
ok  autoreas-bridge/internal/events     1.310s  coverage: 100.0%
ok  autoreas-bridge/internal/sync       1.658s  coverage: 79.2%
ok  autoreas-bridge/internal/tracerbullet 1.180s coverage: 77.8%
```

All packages: GREEN. Zero failures.

## Spec Compliance Matrix

| Requirement | Scenario | Verdict | Test |
|-------------|----------|---------|------|
| PATCH Happy Path | Valid update + fractional nrocapvisto (0.5) | ✅ PASS | `TestPatchAnimeHandlerReturnsOKForValidPatch` |
| PATCH Happy Path | Inactive anime (activo=false) patchable | ✅ PASS | `TestPatchAnimeHandlerAllowsInactiveAnime` |
| Validation Errors | Missing bearer → 401 | ✅ PASS | `TestPatchAnimeHandlerReturnsUnauthorizedWithoutBearer` |
| Validation Errors | Invalid estado (5,-1), negative nrocapvisto, malformed JSON → 400 | ✅ PASS | `TestPatchAnimeHandlerRejectsInvalidPayloads` (table-driven) |
| Anti-Zombie | Tombstoned/non-existent → 404 | ✅ PASS | `TestPatchAnimeHandlerReturnsNotFoundForZombieAnime` |
| Anti-Zombie | activo=false ≠ tombstone, still 200 | ✅ PASS | `TestPatchAnimeHandlerAllowsInactiveAnime` |
| Cross-Field State | nrocapvisto >= totalcap > 0 → force estado=1 | ✅ PASS | `TestPatchAnimeHandlerForcesEstadoWhenProgressReachesTotalCap` |
| Cross-Field State | totalcap=0/null → no auto-force | ✅ PASS | `ApplyCompletionStateMachine` guards `*totalCap <= 0` |
| Clock Skew | Client timestamp silently discarded, server stamps own | ✅ PASS | `TestPatchAnimeHandlerSilentlyDiscardsClientTimestamp` |
| Full Payload Integrity | Full snapshot loaded, merged, full doc published | ✅ PASS | `WriteService.PatchAnime` — loads full JSON from anime_snapshots, merges, publishes |
| Sync Reconcile | POST /api/sync/reconcile valid → 202 + SyncRequestedEvent | ✅ PASS | `TestSyncHandlerReturnsAccepted`, `internal/sync/service_test.go` |
| Sync Reconcile | Missing bearer → 401 | ✅ PASS | `TestSyncHandlerReturnsUnauthorizedWithoutBearer` |
| Method Enforcement | POST /api/animes → 405 (no auth needed) | ✅ PASS | `handleAnimes` in router.go |
| Method Enforcement | DELETE /api/animes/:id → 405 (no auth needed) | ✅ PASS | `handleAnimeByID` case MethodDelete |

## Tasks Completion

All 14 tasks in `tasks.md` are checked `[x]`. No pending items.

## Key Architecture Decisions Verified

1. **Snapshot-backed merge**: `WriteService.PatchAnime` always loads the full canonical JSON from `anime_snapshots`, never publishes sparse payloads. Append-only writer contract preserved.
2. **Anti-zombie via absence**: `QueryService.GetEffectiveAnime` queries `anime_snapshots` by `anime_id`. Absence = tombstoned or never existed. `activo=false` remains present and patchable.
3. **Server-owned timestamps**: `StampServerTimestamp(now())` called unconditionally after merge. Client fields like `fechaUltCapVisto` are not in `AnimePatch` struct, so they are silently dropped at JSON decode.
4. **Cross-field applied twice**: Once at handler level (before calling write service) and once inside write service (after merge, to catch totalcap from the snapshot). Idempotent due to `*totalCap <= 0` guard.
5. **SyncTriggerService**: Publishes `events.SyncRequestedEvent{}` on the event bus. HTTP returns 202 immediately.

## Warnings

None.
