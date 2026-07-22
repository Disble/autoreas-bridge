# Design: Create Anime (Editor, batch-capable)

## Technical Approach

Backend-first. Make placements the single source of day/order on `contracts.AnimeCreate`, thread multi-day placements into the canonical snapshot, and add one atomic batch path (`CreateService.CreateBatch`) that persists new animes plus reflowed existing neighbors through the existing `Gateway.ApplyBatch` (whole-batch stage/finalize, base-token rejection). Expose it as `App.CreateAnime`. Frontend adds an isolated `anime-create` feature and a Library/Create tab shell, reusing `AnimeScheduleOrdering` as a controlled input via additive props — collision engine untouched.

## Architecture Decisions

### Decision: Placements own day/order on AnimeCreate
**Choice**: Replace `Section string` + `Orden int` with `Dias []Placement` (REQUIRED, >=1); `Placement{Day string; Order int}`. `validateCreateRequest` requires >=1 placement, each with non-empty `Day` and `Order>0`. `store.CanonicalCreateInput` gains `Days []AnimeDay`; `NewCanonicalCreate` emits the full `days` array instead of a single `{Section,Order}`.
**Alternatives**: Keep Section/Orden and add Dias (dual source). Rejected — two ways to express placement invites drift; memory decision unifies weekday + special queue as one placement list.
**Rationale**: Legacy "Agregar" already listed weekdays and Estrenos queues in one order dropdown; one placement list matches the board's `kind: 'weekday' | 'special'` destinations.

### Decision: Season adapts to the generalized layer
**Choice**: `seasonAnimeGateway.CreateAnime` builds `Dias: []contracts.Placement{{Day: in.Section, Order: nextOrden(...)}}`. `nextOrden` stays as-is.
**Rationale**: Season passes its default `Sin ver` placement; the layer is not shaped for season (memory decision).

### Decision: Atomic batch via ApplyBatch, not per-record creates
**Choice**: New `CreateService.CreateBatch(ctx, []AnimeCreate, []ApplyAnimeScheduleDraftEntry)`. It validates/enriches each create, builds create `store.BatchOperation`s (`Base` = empty snapshot; `Desired` = `NewCanonicalCreate` with placements) and neighbor reflow operations (reuse the `buildScheduleOperation` shape: decode, `SetDays`, re-marshal), then one `ApplyBatch`. A stale neighbor base (hash/modifiedAt mismatch) rejects the whole batch.
**Alternatives**: Loop `CreateCanonicalAnime` per anime then patch neighbors. Rejected — non-atomic, partial writes on failure (proposal risk).
**Rationale**: `ApplyBatch` already stages+finalizes many writes under one `BatchID` atomically (SDD-55 ADR-55-1); `ScheduleService.Apply` proves the reflow pattern.

### Decision: AnimeScheduleOrdering generalized by additive props, edit path unchanged
**Choice**: Add optional `lockedAnimeIds?: readonly string[]` (cards for those ids render with drag disabled but still reflow when a draft inserts above them) and a `create`-variant apply seam. The create feature seeds synthetic draft entries (`animeId: '__draft__:N'`, `modifiedAt: 0`) into `board.entries`, starting in staging. A new pure helper `partitionCreateSubmit(board, state)` splits `buildAnimeScheduleDraftPlacements(state)` by the `__draft__:` prefix into `{ creates, changedNeighbors }`. Edit callers pass none of this → identical behavior.
**Alternatives**: Fork a second board component. Rejected — duplicates the collision/reducer engine. Refactor edit modal self-persist. Rejected — out of scope (aggregate boundary).
**Rationale**: Persistence coupling stays at the output seam; the reducer, `applyAnimeScheduleOrder`, and validation are reused verbatim.

## Data Flow

    Create feature (batch grid + seeded board)
        │  partitionCreateSubmit(board, state)
        ▼
    source.createAnime(command) ──→ App.CreateAnime ──→ CreateService.CreateBatch
        │                                                     │ validate + enrich
        ▼                                                     ▼
    AnimeCreateResult  ◄──── ApplyBatch (creates + neighbor reflow, atomic)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/api/contracts/services.go` | Modify | `AnimeCreate.Dias []Placement`; new `Placement`; `AnimeCreateResult` DTO |
| `internal/anime/create_service.go` | Modify | Placement validation; add `CreateBatch` |
| `internal/anime/create_batch.go` | Create | Build create + neighbor `BatchOperation`s, call `ApplyBatch` |
| `internal/anime/write_service.go` | Modify | Thread placements into `CanonicalCreateInput.Days`; expose batch writer seam |
| `internal/anime/store/create.go` | Modify | `CanonicalCreateInput.Days`; emit full `days` array |
| `app_season_anime_gateway.go` | Modify | Pass `Dias` default placement |
| `app_runtime_create.go` | Create | `App.CreateAnime` binding + DTO mapping |
| `frontend/src/shared/contracts/anime.types.ts` | Modify | `AnimeCreateCommand`, `AnimeCreatePlacement`, `AnimeCreateResult` |
| `frontend/src/features/anime-schedule-ordering/.../*.types.ts,.helpers.ts,.tsx` | Modify | `lockedAnimeIds`, create variant, `partitionCreateSubmit` |
| `frontend/src/features/anime-create/**` | Create | Colocated feature (grid, board mount, hook, helpers, types, constants, tests) |
| `frontend/src/app/routes/AnimeEditorRoute.tsx` | Modify | Library/Create Tabs shell (composition only) |
| `frontend/src/infrastructure/bridge-runtime-source/*` | Modify | `createAnime` source method + DTO mappers |

## Interfaces / Contracts

```go
type Placement struct { Day string `json:"day"`; Order int `json:"order"` }
// AnimeCreate: Dias []Placement `json:"dias"` (>=1); Section/Orden removed.
type AnimeCreateResult struct {
    Outcome AnimePatchOutcome `json:"outcome"`; Message string `json:"message"`
    AnimeIDs []string `json:"animeIds"`; ModifiedAt int64 `json:"modifiedAt"`
    ConflictID string `json:"conflictId,omitempty"`; Details map[string]string `json:"details,omitempty"`
}
func (s *CreateService) CreateBatch(ctx, creates []contracts.AnimeCreate, neighbors []contracts.ApplyAnimeScheduleDraftEntry) (contracts.AnimeCreateResult, error)
```

```ts
interface AnimeCreatePlacement { readonly day: string; readonly order: number }
interface AnimeCreateItem { readonly name: string; readonly page: string; readonly kind?: number;
  readonly folder?: string; readonly placements: readonly AnimeCreatePlacement[]; /* +optional metadata */ }
interface AnimeCreateCommand { readonly boardModifiedAt: number; readonly creates: readonly AnimeCreateItem[];
  readonly changedNeighbors: readonly ApplyAnimeScheduleDraftEntry[] }
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (Go) | `validateCreateRequest` >=1 placement; `NewCanonicalCreate` multi-day; season default placement | table tests |
| Integration (Go) | `CreateBatch` atomic: creates + neighbor reflow; whole-batch rejection on stale neighbor base | stored-shape fixtures + `ApplyBatch` double |
| Unit (vitest) | `partitionCreateSubmit` splits draft vs neighbor; `lockedAnimeIds` reflow | colocated helpers/hook tests |
| Component | Board seeds `__draft__` in staging; existing cards non-draggable but reflow; no duplicates | testDriverRef move |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. `App.CreateAnime` reuses the existing Wails binding pattern; atomicity is covered under Reliability tests.

## Migration / Rollout

No data migration. Contract change is source-internal (English wire, no external Legacy consumer since SDD-55); season and editor recompile against the new shape. `App.CreateAnime` and `anime-create` are additive and isolated.

## Open Questions

- None blocking. Optional-metadata enrichment stays nil-provider (out of scope).
