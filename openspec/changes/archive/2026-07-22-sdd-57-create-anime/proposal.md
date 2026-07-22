# Proposal: Create Anime (Editor, batch-capable)

## Intent

The Editor can only edit existing records; there is no Bridge replacement for Legacy's "Agregar". Users must add animes manually, in batches, and place each on a weekday or a special queue (e.g. "Sin ver") with an order — today impossible. The backend create pipeline (`anime.CreateService.CreateAnime`) already exists and is tested, but is reachable only through season intake. This change wires that pipeline to a new Editor entry point and reuses the existing schedule board, delivering a 2026-grade batch create surface without rebuilding machinery.

## Scope

### In Scope
- Generalize `contracts.AnimeCreate`: add `Dias []Placement` (REQUIRED, >=1); fold `Section`/`Orden` into placements (a `day` may be a weekday OR a special queue). Nombre + Pagina stay required. Season adapts by passing its default `Sin ver` placement.
- New app-level Wails binding `App.CreateAnime` exposing `a.animeCreate` directly (not via season).
- New Editor **Create tab** beside "Library": batch grid (Name, Page, Type, Folder + per-row disclosure for optional metadata: progress/total/duration/cover) + embedded day/order board.
- Reuse `AnimeScheduleOrdering` as a persistence-agnostic CONTROLLED input: seed each draft as a draggable card (synthetic id `__draft__:N`) starting in staging; existing cards drag-locked but reflow on mid-insertion; collision-safety free.
- Deferred persistence: one submit transaction persists new animes with their placements plus shifted existing neighbors (via `buildAnimeScheduleDraftPlacements`).

### Out of Scope
- Refactoring the edit-mode schedule modal's self-persist behavior (legitimate global aggregate boundary).
- Relaxing Nombre/Pagina requirements.
- MetadataProvider cover/enrichment lookup for manual create (nil-provider path is fine).

## Capabilities

### New Capabilities
- `anime-create-editor`: Editor Create tab — batch grid, per-row optional-metadata disclosure, board-as-controlled-input, single deferred submit transaction, no modal-over-modal, no chips.

### Modified Capabilities
- `anime-create-canonical`: `AnimeCreate` gains required `Dias []Placement`; `Section`/`Orden` fold into placements; season passes a default placement.
- `anime-schedule-ordering`: board usable in create mode with draft cards (synthetic ids), staging start, and mid-insertion reflow of locked existing cards.
- `anime-editor`: Editor route gains a Create tab beside the edit-only Library rail.

## Approach

Backend-first: extend the contract + validation so placements are the single source of day/order, keeping `CreateService` otherwise untouched; expose `App.CreateAnime`. Frontend: add the Create tab and batch form, mount the reused board as a controlled input keyed on synthetic draft ids, and defer all writes to one submit that batches new records + neighbor reflow.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/contracts/services.go` | Modified | Add `Dias []Placement`; fold Section/Orden |
| `internal/anime/create_service.go` | Modified | Validate placements (>=1) |
| `app_season_anime_gateway.go` | Modified | Pass default `Sin ver` placement |
| `app_runtime_services.go` / app bindings | Modified | New `App.CreateAnime` binding |
| `frontend/src/features/anime-editor` | Modified | Create tab + batch grid |
| `frontend/src/features/anime-schedule-ordering` | Modified | Create-mode draft cards / controlled input |
| `frontend/src/shared/contracts/anime.types.ts` | Modified | Draft placement types |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Placement generalization breaks season intake | Med | Season adapts via default placement; cover with tests |
| Neighbor-reflow transaction partial write | Med | Single atomic submit; reject whole batch on stale record |
| File-size policy breach on Editor feature | Med | Colocate sub-modules; keep files <400 effective lines |

## Rollback Plan

Revert the change commit. Contract change is additive; `App.CreateAnime` is a new binding and the Create tab is isolated, so removal leaves edit-mode and season intake untouched.

## Dependencies

- None external. Relies on existing `CreateService` and `AnimeScheduleOrdering`.

## Success Criteria

- [ ] `AnimeCreate` requires >=1 placement; season intake still works (`go test ./...`).
- [ ] `App.CreateAnime` persists a batch with placements + neighbor reflow in one transaction.
- [ ] Editor Create tab creates multiple animes in one submit; existing cards reflow, no collisions, no modal-over-modal, no chips.
- [ ] Repo gates pass: English code, file-size warn/fail policy, strict TDD (backend + vitest).
