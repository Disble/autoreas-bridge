# Exploration: SDD-16 Mobile Sync Contract

## Inputs reviewed

- `D:\dev\disble\autoreas-sp\autoreas-mobile\docs\bridge-gaps.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-design-doc.md`
- `openspec/specs/rest-api-write-sync/spec.md`
- `openspec/specs/websocket-resync-ip-qr/spec.md`
- Current runtime code under `internal/api`, `internal/anime`, `internal/device`, `internal/realtime`, `internal/sync`

## Current runtime truth

The bridge currently exposes only three client-facing operations:

- `POST /api/devices/pair`
- `PATCH /api/animes/:id`
- `POST /api/sync/reconcile`

The WebSocket hub currently emits:

- `sync_required`
- `anime_changed`

There is no authenticated read API for anime snapshots, no incremental changelog read API, no device management API, no bridge status API, and no conflicts API.

## Important code discoveries

### 1. Snapshot truth already exists in SQLite

`internal/sync/AnimeSnapshotStore` already persists the effective anime baseline in `anime_snapshots` and supports:

- listing all snapshots
- reading one snapshot by `_id`

This means `GET /api/animes` and `GET /api/animes/:id` do not require a new persistence layer. The missing piece is a serializer from legacy snapshot JSON into the mobile contract.

### 2. The changelog table is too weak for mobile sync

Current `changelog` schema only stores:

- `anime_id`
- `payload_json`
- `status`

It does not store:

- change timestamp
- change type (`create|update|delete`)
- changed field list
- a stable response shape for incremental sync

The current recorder can persist only that an `AnimeChangedEvent` happened. It cannot yet answer `GET /api/animes/changes?since=` or `POST /api/sync/reconcile` with bridge changes.

### 3. The domain already detects deletes

`internal/anime/DiffSnapshots` already emits `events.AnimeChangedEvent{Payload:nil}` when an anime disappears from the effective state. So the runtime already knows when a delete happened, but the event contract collapses create/update/delete into the same shape.

### 4. Mobile serialization is stricter than the legacy JSON

The mobile app expects REST anime snapshots to validate against `src/infrastructure/validation/anime-schema.ts`, especially:

- `activo` and `primeravez` MUST be `0|1`, never booleans
- `dias` MUST be an array of `{dia, orden}` for REST snapshots
- `generos` MUST be `string[]`
- `portada` MUST be `string|null`, not the legacy object
- `estudios` MUST be `string|null`
- date fields MAY be numeric timestamps

The current Go model preserves legacy fidelity for writing, but it does not yet expose a normalized mobile-facing DTO.

### 5. The raw model is missing typed accessors for several fields mobile needs

`LegacyAnimeRaw` currently has typed fields for many legacy properties, but not for:

- `primeravez`
- `fechaCreacion`
- `fechaEliminacion`
- `origen`

Those fields are preserved inside `extraFields`, so writes are safe today, but a proper read serializer either needs typed accessors or explicit raw extraction helpers.

### 6. The current WS contract is not enough for first sync of new records

The current bridge emits `anime_changed` with a partial payload. The mobile app currently applies that payload directly as `UPDATE`, which fails silently if the row does not exist locally.

The bridge gaps document proposes the safer contract:

1. WS signals the `_id`
2. Mobile fetches `GET /api/animes/:id`
3. Mobile upserts the full normalized snapshot

This bridge change can unlock that flow by exposing `GET /api/animes/:id` and by emitting explicit create/delete events in addition to `anime_changed`.

### 7. Full RFC-grade reconcile is still absent

The design doc envisions bidirectional changelog exchange plus conflict storage. The current bridge still uses the simpler real-world model where mobile pushes writes through `PATCH /api/animes/:id`.

A practical near-term decision is required:

- Keep PATCH as the authoritative mobile->bridge write path
- Upgrade `POST /api/sync/reconcile` to serve bridge->mobile changelog exchange immediately
- Accept the request body shape for future compatibility, but do not duplicate PATCH write processing inside reconcile yet

This choice matches the current mobile implementation and closes the urgent read-side gaps first.

## Feasible change boundary for SDD-16

This change can fully deliver the urgent contract needed by mobile without inventing a second write pipeline:

- Add authenticated `GET /api/animes`
- Add authenticated `GET /api/animes/:id`
- Add authenticated `GET /api/animes/changes?since=<timestamp>`
- Upgrade `POST /api/sync/reconcile` to accept the RFC-style body and return bridge changes
- Extend the changelog persistence model to include timestamp, change type, changed fields, and snapshot payload
- Normalize REST snapshots to the mobile schema
- Emit explicit WS events for create and delete while preserving `sync_required`
- Add `GET /api/status`
- Add `GET /api/devices` and `DELETE /api/devices/:id`
- Add `GET /api/conflicts` and `POST /api/conflicts/:id/resolve` with an empty-but-real persistence boundary so the API exists even before automatic conflict generation is implemented

## Decision to carry into proposal

SDD-16 should choose the incremental path:

- Mobile writes continue using `PATCH /api/animes/:id`
- `POST /api/sync/reconcile` becomes the bridge-change exchange endpoint, not a second patch executor
- WS event names stay underscore-based (`anime_changed`, `anime_created`, `anime_deleted`) to remain consistent with the current bridge/mobile implementation family instead of introducing a second naming style midstream
