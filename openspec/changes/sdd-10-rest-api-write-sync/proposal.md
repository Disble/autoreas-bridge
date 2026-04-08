# Proposal: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

## Intent

Enable clients (like the Android Tablet) to update anime tracking state and trigger synchronizations. This requires a robust PATCH endpoint that enforces business rules (anti-zombies, cross-field state logic) and a sync trigger endpoint, bridging HTTP requests to our append-only event-driven core without data corruption.

## Scope

### In Scope
- `PATCH /api/animes/:id`: Update `nrocapvisto` (including fractional), `estado` (0,1,2,3), and `dias`.
- `POST /api/sync/reconcile`: Trigger system synchronization.
- **Anti-Zombies**: Reject updates to tombstoned (`$$deleted`) or non-existent animes (404). Allow updates to inactive (`activo=false`) animes.
- **State Machine**: Force `estado = 1` if `nrocapvisto >= totalcap > 0`.
- **Timestamp Ownership**: Server exclusively sets `time.Now().UnixMilli()`. Client timestamps are silently accepted and ignored.
- Service layer for snapshot-backed merging to prevent partial-patch data loss.

### Out of Scope
- Direct synchronous execution of the reconcile process inside the HTTP handler (will use event bus).
- Modifying the underlying append-only file format.

## Approach

**Snapshot-backed merge/write service**:
1.  **Read**: The PATCH handler loads the effective anime record from the `anime_snapshots` SQLite store.
2.  **Validate**: Ensures the record exists and is not a tombstone.
3.  **Merge & Mutate**: Merges incoming patch fields (`nrocapvisto`, `estado`, `dias`) into the canonical representation.
4.  **Business Rules**: 
    - Applies cross-field logic: if `nrocapvisto >= totalcap` and `totalcap > 0`, it overrides `estado = 1`.
    - Discards any client-provided timestamp and stamps `time.Now().UnixMilli()`.
5.  **Dispatch**: Publishes a full, canonical `AnimeUpdateRequestedEvent` to the bus (avoiding sparse JSON that would corrupt the last-line-wins file).
6.  **Sync Trigger**: The `/api/sync/reconcile` endpoint publishes a `SyncRequestedEvent`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/router.go` | Modified | Add PATCH and POST routes and wiring. |
| `internal/api/server.go` | Modified | Inject new anime write/sync services. |
| `internal/anime/service.go` | New | Snapshot-backed merge/write application service. |
| `internal/anime/domain/anime_raw.go` | Modified | Expose typed accessors for `estado`, `totalcap`, `dias`, timestamps. |
| `internal/api/handlers_test.go` | New | HTTP integration tests (404, 400, 200, cross-field logic). |
| `app.go` | Modified | Wire new services and HTTP endpoints. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Partial-patch corruption** | High | Service MUST fetch the full snapshot and publish the fully merged JSON document, never sparse JSON. |
| **Model expansion drift** | Medium | Add strict unit tests for `LegacyAnimeRaw` decoding/encoding of `estado` and `totalcap`. |
| **Client clock skew** | Low | Explicitly silently ignore transport timestamp fields; server strictly overwrites. |

## Rollback Plan

Revert routing additions in `internal/api/router.go` to return `501 Not Implemented` and remove the new service injections from `app.go`. The append-only file will naturally ignore un-dispatched events.

## Dependencies

- Existing `anime_snapshots` SQLite read model.
- `internal/events/bus.go` for dispatching.

## Success Criteria

- [ ] `PATCH` to an anime with `totalcap: 12` using `{"nrocapvisto": 12}` forces `estado: 1`.
- [ ] `PATCH` accepts fractional `nrocapvisto` (e.g., `10.5`).
- [ ] Client timestamps are ignored; server stamps current Unix time.
- [ ] `PATCH` to a tombstoned anime returns 404.
- [ ] `POST /api/sync/reconcile` successfully dispatches `SyncRequestedEvent`.
