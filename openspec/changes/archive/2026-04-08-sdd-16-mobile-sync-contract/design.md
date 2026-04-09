# Design: SDD-16 Mobile Sync Contract

## 1. Architecture overview

This change turns the existing runtime pieces into a real mobile-facing contract by adding three layers:

1. A mobile serializer over effective anime snapshots
2. A stronger changelog persistence/query boundary in `internal/sync`
3. New authenticated REST handlers and richer WS message types in `internal/api` and `internal/realtime`

```text
anime_snapshots ----> anime query/serializer ----> GET /api/animes, GET /api/animes/:id
       |
       +---- diff/writer/watcher ----> AnimeChangedEvent ----> changelog recorder ----> changelog table/query
                                                                  |                         |
                                                                  |                         +--> GET /api/animes/changes
                                                                  |                         +--> POST /api/sync/reconcile
                                                                  |
                                                                  +--> realtime hub ----> anime_changed / anime_created / anime_deleted
```

## 2. Scope decisions

- `PATCH /api/animes/:id` remains the only bridge write endpoint used by mobile operations.
- `POST /api/sync/reconcile` becomes a bridge-change fetch endpoint with a compatibility request body.
- WS naming remains underscore-based (`anime_changed`, `anime_created`, `anime_deleted`) to stay aligned with the current bridge/mobile family.
- Conflict endpoints are implemented as a real persistence/API boundary, but automatic conflict generation remains future work.

## 3. Anime serialization design

### 3.1 Raw model extension

`LegacyAnimeRaw` will grow typed access for the fields mobile needs to read explicitly:

- `Primeravez LegacyBoolField`
- `FechaCreacion LegacyDateField`
- `FechaEliminacion LegacyDateField`
- `Origen LegacyStringField`

These are already preserved inside `extraFields`; making them typed gives a safe and testable read boundary without changing write fidelity.

### 3.2 Mobile DTO

Add a mobile-facing DTO in `internal/anime` or `internal/api/contracts` with the exact REST payload shape:

```go
type MobileAnime struct {
    ID               string           `json:"_id"`
    Nombre           string           `json:"nombre"`
    Estado           int              `json:"estado"`
    NroCapVisto      float64          `json:"nrocapvisto"`
    TotalCap         *int             `json:"totalcap"`
    Activo           int              `json:"activo"`
    PrimeraVez       int              `json:"primeravez"`
    Dias             []MobileAnimeDay `json:"dias"`
    Generos          []string         `json:"generos"`
    Tipo             *int             `json:"tipo"`
    FechaUltCapVisto *int64           `json:"fechaUltCapVisto"`
    FechaEstreno     *int64           `json:"fechaEstreno"`
    FechaCreacion    *int64           `json:"fechaCreacion"`
    FechaEliminacion *int64           `json:"fechaEliminacion"`
    Portada          *string          `json:"portada"`
    Pagina           *string          `json:"pagina"`
    Carpeta          *string          `json:"carpeta"`
    Estudios         *string          `json:"estudios"`
    Origen           *string          `json:"origen"`
    Duracion         *int             `json:"duracion"`
}
```

Normalization rules:

- `activo`: `true -> 1`, `false|absent -> 0`
- `primeravez`: `true -> 1`, `false|absent -> 0`
- `estado`: absent defaults to `0`
- `dias`: prefer `dias[]`; fall back to `dia` + `orden`; default `[]`
- `generos`: decode `[]string`; `""` becomes `[]`
- `estudios`: join string array with `, ` when present, else `null`
- `portada`: extract `.path` when the legacy object exists, else `null`
- date fields: serialize as Unix ms numbers or `null`

## 4. Query service expansion

`internal/anime/QueryService` will add:

- `ListEffectiveAnimes(ctx) ([]MobileAnime, error)`
- `GetMobileAnime(ctx, id string) (*MobileAnime, error)`

It will reuse `AnimeSnapshotStore.ListSnapshots()` and `GetSnapshot()` and the new serializer helper.

## 5. Changelog redesign

### 5.1 Schema

Upgrade the `changelog` table to include the fields needed by incremental sync:

```sql
CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    changed_fields_json TEXT NOT NULL,
    snapshot_json TEXT,
    status TEXT NOT NULL,
    changed_at_ms INTEGER NOT NULL
)
```

Compatibility approach:

- This repo is still in local-dev stage, so the bootstrap can create the new schema directly.
- Tests that inspect `payload_json` must be updated to use `snapshot_json` and the new fields.

### 5.2 Entry model

Replace the minimal `ChangelogEntry` with a richer Sync-local model:

```go
type ChangelogEntry struct {
    ID             int64
    AnimeID        string
    ChangeType     string
    ChangedFields  []string
    SnapshotJSON   []byte
    Status         string
    ChangedAtMs    int64
}
```

### 5.3 Recorder enrichment

Extend `events.AnimeChangedEvent` with:

- `ChangeType string`
- `ChangedFields []string`

Publishers populate it as follows:

- `DiffSnapshots`: `create` when ID absent from baseline, `update` when hash changed, `delete` when ID removed
- `UpdateWriter`: `update`; `changed_fields` may be empty because it is not needed by the current WS consumers, but the changelog recorder can still store an empty array safely

The recorder stamps `ChangedAtMs` using `time.Now().UnixMilli()`.

### 5.4 Query methods

Add changelog store queries:

- `ListSinceTimestamp(ctx, sinceMs int64) ([]ChangelogEntry, error)`
- `ListAfterID(ctx, lastID int64) ([]ChangelogEntry, error)`
- `LastID(ctx) (int64, error)`
- `LastChangedAt(ctx) (*int64, error)`

The REST layer will map `SnapshotJSON` through the same mobile serializer used by the snapshot endpoints.

## 6. Device management design

Extend `device.Store` with:

- `ListPairedDevices(ctx) ([]StoredDevice, error)`
- `DeletePairedDevice(ctx, deviceID string) error`

`DELETE /api/devices/:id` physically removes the row from `devices`. Since authentication resolves by token lookup in the same table, revocation immediately invalidates the token.

## 7. Status and conflicts design

### 7.1 Status

Add a tiny status service composed from:

- DB ping / availability
- device count
- last changelog id
- last changelog timestamp
- server effective address (already available from `app.go` bindings/server)

### 7.2 Conflicts

Add a minimal `conflicts` table and store:

```sql
CREATE TABLE IF NOT EXISTS conflicts (
    conflict_id TEXT PRIMARY KEY,
    anime_id TEXT NOT NULL,
    local_snapshot_json TEXT NOT NULL,
    remote_snapshot_json TEXT NOT NULL,
    detected_at_ms INTEGER NOT NULL,
    status TEXT NOT NULL,
    resolved_at_ms INTEGER,
    resolution TEXT
)
```

This change will not generate rows automatically yet, but it creates a truthful API boundary:

- `GET /api/conflicts` returns all pending rows
- `POST /api/conflicts/:id/resolve` marks one row resolved

## 8. Realtime message design

Extend `internal/realtime/message.go` with:

- `MessageTypeAnimeCreated = "anime_created"`
- `MessageTypeAnimeDeleted = "anime_deleted"`

Message shapes:

```json
{"type":"sync_required","reason":"connection_gap_assumed"}
{"type":"anime_changed","anime_id":"abc"}
{"type":"anime_created","anime_id":"abc"}
{"type":"anime_deleted","anime_id":"abc"}
```

`anime_changed` MAY continue carrying `payload` as an optional field for compatibility, but the contract no longer relies on that payload for correctness because `GET /api/animes/:id` now exists.

## 9. HTTP routing changes

New routes to register in `internal/api/router.go`:

- `GET /api/animes`
- `GET /api/animes/{id}`
- `GET /api/animes/changes`
- `GET /api/status`
- `GET /api/devices`
- `DELETE /api/devices/{id}`
- `GET /api/conflicts`
- `POST /api/conflicts/{id}/resolve`

Method handling stays explicit at the router edge.

## 10. Strict TDD plan

1. RED: serializer/query tests for list/detail normalization
2. GREEN: minimal serializer/query implementation
3. RED: changelog schema/store/recorder query tests
4. GREEN: minimal schema + query/store implementation
5. RED: REST handler/router tests for new endpoints
6. GREEN: minimal handlers and wiring
7. RED: realtime message/hub tests for create/delete typing
8. GREEN: message/hub implementation
9. RED: OpenAPI drift test (`go run ./tools/checkopenapi` after doc update)
10. GREEN: documentation update
