# Design: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

## Technical Approach

Keep HTTP thin and move write rules into an application service. `PATCH /api/animes/:id` will authenticate, decode a strict patch DTO, call a snapshot-backed write service, and translate domain errors to HTTP. `POST /api/sync/reconcile` will only trigger `events.SyncRequestedEvent` and return `202 Accepted`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Handler placement | Keep all logic in `internal/api/router.go`; extract handler methods into dedicated files | Extract handler methods into `internal/api/handlers/anime_handler.go` and `internal/api/handlers/sync_handler.go`, keep route registration in `router.go` | `router.go` already owns mux wiring; new files keep adapter code readable without changing the package structure or composition pattern. |
| Legacy mutation model | Generic `map[string]any`; separate duplicate read/write model; extend `LegacyAnimeRaw` helpers | Add typed helpers to `internal/anime/domain/anime_raw.go` and keep `LegacyAnimeRaw` as the merge vessel | It already preserves unknown legacy fields through `extraFields`; helpers avoid leaking raw JSON mutation into HTTP/service code. |
| Snapshot lookup boundary | Handlers query SQLite directly; service owns lookup; reuse startup `SnapshotStore` interface | Introduce dedicated query/write interfaces in `api.Config`; concrete services live outside handlers | Preserves hexagonal boundaries and keeps HTTP adapter ignorant of SQLite/event bus details. |

## Data Flow

```text
PATCH /api/animes/:id
  -> api anime handler
  -> AnimeWriteService.PatchAnime(id, patch)
  -> AnimeQueryService.GetEffectiveAnime(id)
  -> anime_snapshots lookup + snapshot_json load
  -> merge into LegacyAnimeRaw
  -> force estado=1 when nrocapvisto >= totalcap > 0
  -> stamp server timestamp
  -> Publish(AnimeUpdateRequestedEvent)
  -> writer appends full JSON line

POST /api/sync/reconcile
  -> api sync handler
  -> SyncTriggerService.TriggerReconcile()
  -> Publish(SyncRequestedEvent)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `internal/api/router.go` | Modify | Register sync route and delegate PATCH/POST handling to extracted methods. |
| `internal/api/server.go` | Modify | Extend `api.Config` with anime query/write and sync trigger dependencies. |
| `internal/api/handlers/anime_handler.go` | Create | PATCH decoding, auth reuse, HTTP error mapping, service invocation. |
| `internal/api/handlers/sync_handler.go` | Create | `POST /api/sync/reconcile` endpoint returning `202`. |
| `internal/anime/service.go` | Create | Concrete `AnimeQueryService` and `AnimeWriteService` implementations. |
| `internal/anime/domain/anime_raw.go` | Modify | Add typed helpers for `estado`, `totalcap`, `dias`, and timestamp mutation. |
| `internal/sync/anime_snapshot_store.go` | Modify | Add single-anime snapshot lookup returning raw JSON by `anime_id`. |
| `app.go` | Modify | Build concrete services from DB + event bus and inject them into `api.Config`. |

## Interfaces / Contracts

```go
type AnimePatch struct {
    Estado       *int      `json:"estado,omitempty"`
    NroCapVisto  *float64  `json:"nrocapvisto,omitempty"`
    Dias         *[]string `json:"dias,omitempty"`
}

type EffectiveAnime struct {
    ID       string
    TotalCap *float64
    Activo   *bool
    Deleted  bool
}

type AnimeQueryService interface {
    GetEffectiveAnime(ctx context.Context, id string) (*EffectiveAnime, error)
}

type AnimeWriteService interface {
    PatchAnime(ctx context.Context, id string, patch AnimePatch) error
}

type SyncTriggerService interface {
    TriggerReconcile(ctx context.Context) error
}
```

`Dias` is a pointer-to-slice so omitted vs explicit empty array remain distinguishable. `EffectiveAnime.Deleted` is always `false` for found rows; absence in `anime_snapshots` is treated as zombie/non-existent and becomes 404.

## Merge / Validation Rules

1. Handler decodes strict JSON, validates `estado in {0,1,2,3}` and `nrocapvisto >= 0`, and ignores any timestamp transport fields by not modeling them.
2. `PatchAnime` loads the effective snapshot by `anime_id`; missing row returns a not-found error.
3. Unmarshal `snapshot_json` into `domain.LegacyAnimeRaw`.
4. Apply only non-nil fields. `dias` is converted to `[]LegacyAnimeDay` preserving client order and assigning sequential `orden` values.
5. If `totalcap != nil && *totalcap > 0 && nrocapvisto >= *totalcap`, force `estado = 1`.
6. Stamp `time.Now().UnixMilli()` into the legacy last-modified/view timestamp field before marshal.
7. Marshal the FULL merged document and publish `events.AnimeUpdateRequestedEvent{AnimeID:id, Payload:mergedJSON}`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| HTTP | 401/404/400/405/202 contracts and PATCH success | `httptest` with stub service interfaces in `internal/api/router_test.go` or split handler tests. |
| Service | anti-zombie lookup, inactive-but-patchable behavior, cross-field `estado=1`, fractional progress, full-payload publish | Real SQLite in `t.TempDir()` plus real in-memory bus; no SQLite/event-bus mocks. |
| Domain | typed helper round-trip for `estado`, `totalcap`, `dias`, timestamp stamping | Focused Go tests on `anime_raw.go`. |

## Migration / Rollout

No migration required. This change reuses `anime_snapshots`, existing event names, and the append-only writer contract.

## Open Questions

- [ ] Confirm which legacy timestamp field is the canonical server-owned modification stamp for write events (`fechaUltCapVisto` is the current best fit from fixture evidence).
