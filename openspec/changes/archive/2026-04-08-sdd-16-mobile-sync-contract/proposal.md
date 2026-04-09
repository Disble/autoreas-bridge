# Proposal: SDD-16 Mobile Sync Contract

## Intent

Close the bridge-side gaps that currently block Autoreas Mobile from synchronizing end-to-end. The bridge must expose normalized read APIs, incremental bridge changelogs, practical reconcile responses, and explicit realtime create/delete events using the data shapes the mobile app already expects.

## Scope

**In Scope:**

- Authenticated `GET /api/animes`
- Authenticated `GET /api/animes/:id`
- Authenticated `GET /api/animes/changes?since=<timestamp>`
- `POST /api/sync/reconcile` request/response upgrade for bridge changelog exchange
- Mobile-safe anime serialization (`activo`/`primeravez` as `0|1`, `portada` as `string|null`, dates as ms, arrays normalized)
- Changelog schema/store/recorder upgrade to support incremental sync
- Realtime WS events `anime_changed`, `anime_created`, `anime_deleted`, `sync_required`
- Authenticated `GET /api/status`
- Authenticated `GET /api/devices` and `DELETE /api/devices/:id`
- Authenticated `GET /api/conflicts` and `POST /api/conflicts/:id/resolve`
- OpenAPI documentation update for the new/changed contract

**Explicitly Excluded:**

- Changing the mobile app code in this repo change
- Replacing `PATCH /api/animes/:id` as the authoritative write path from mobile to bridge
- Automatic production of conflict rows from the reconciliation engine beyond the current runtime capabilities
- mDNS/discovery work

## Approach

1. Extend sync persistence so the bridge can answer incremental read APIs with stable changelog entries.
2. Add a dedicated mobile serializer over `LegacyAnimeRaw` that converts legacy snapshot JSON into the mobile contract without mutating the file-writing model.
3. Add REST handlers for list/detail/changes/status/devices/conflicts and wire them into `internal/api/router.go`.
4. Enrich realtime messages to distinguish update/create/delete while keeping underscore-based event names.
5. Upgrade `POST /api/sync/reconcile` to accept the compatibility request shape and return bridge changes since the client's known changelog position.
6. Update `docs/openapi.yaml` and verify all new routes are covered by `tools/checkopenapi`.

## Key Decision

The bridge SHALL keep `PATCH /api/animes/:id` as the only mobile->bridge mutation path for now. `POST /api/sync/reconcile` SHALL be upgraded for bridge->mobile changelog exchange and future compatibility, but it SHALL NOT execute pending mobile operations server-side in this change. This avoids duplicating write logic while still unblocking the urgent mobile sync flow.

## Affected Modules

- `internal/anime`
- `internal/api`
- `internal/device`
- `internal/realtime`
- `internal/sync`
- `docs/openapi.yaml`
- `app.go`

## Risks

- The serializer may mis-handle rare legacy payload variants if it relies on assumptions not covered by the real fixture tests.
- Changing the changelog schema touches bootstrap and query code, so older tests may need fixture updates.
- WS contract expansion must not break existing `anime_changed` consumers.

## Rollback Plan

If this change causes regressions:

1. Revert the new REST routes and realtime message types.
2. Revert the changelog schema/recorder upgrades.
3. Restore the prior `docs/openapi.yaml` and keep only the previously working pair/patch/reconcile surface.
