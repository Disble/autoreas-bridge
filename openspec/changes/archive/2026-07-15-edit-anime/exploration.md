# Exploration: edit-anime

### Current State
The bridge already supports anime creation plus specialized desktop mutations for chapter progress, state, days, soft delete, restore, and repeat. Those writes flow through `app_runtime.go` Wails bindings into `internal/anime` services, then through the single `internal/anime/legacy.Gateway` that owns loading, merging, OCC, staged append recovery, changelog publication, and websocket payload fan-out.

General multi-field editing does not exist. `frontend/src/features/anime-detail/ui/AnimeDetail/*` is a read-focused detail screen with Repeat/Restore only. The current desktop read DTO is `contracts.MobileAnime` via `App.GetAnimeDetail`, which exposes many legacy-backed fields but still flattens some data for display, notably `estudios` as a comma-joined string. The archived SDD-49 title includes `edit`, yet its actual proposal explicitly kept a general multi-field editor out of scope.

Candidate user-editable fields, based on current data shape and existing desktop visibility, are:
- Safe first wave: `nombre`, `estado`, `nrocapvisto`, `dias`, `pagina`, `carpeta`, `tipo`, `generos`, `origen`, `duracion`, `totalcap`
- Conditional / needs explicit product decision: `fechaEstreno`, `fechaUltCapVisto`, `fechaCreacion`, `activo`
- Likely NOT general-editor fields: `primeravez`, `repetir`, `_id`, `modified_at`
- Needs a better DTO before editing: `estudios`, `portada`

Business and validation rules already visible in code:
- Wails Bridge UI should send an explicit OCC base token (`modified_at`) for authoritative writes.
- OCC stale explicit base returns `conflict`, current token, and no append.
- `estado` is validated in the 0..3 range on the HTTP path.
- `nrocapvisto` cannot be negative on the HTTP path.
- Existing HTTP/mobile logic forces `estado=1` when progress reaches/exceeds `totalcap`; the desktop general editor currently has no equivalent dedicated enforcement path.
- `activo=false` is an inactive record, not a tombstone.
- Legacy unknown fields must survive round-trips through the gateway.
- Repeat owns `primeravez` and repetition-history semantics; a general editor should not casually rewrite them.

Synchronization and event implications:
- Accepted edits should produce one canonical append, one `anime.changed` event, one changelog entry, and one websocket broadcast.
- A multi-field editor should submit one atomic mutation, not a sequence of field-by-field writes, otherwise conflicts, partial success, and duplicate sync noise become likely.
- Changelog and websocket consumers already understand update payloads, so a general editor fits the existing event model if it uses the same gateway/write path.

Failure and concurrency behavior already established by the runtime boundary:
- Definite append failure aborts the staged operation.
- Ambiguous append/finalize failure stays staged and is recovered later.
- Stale explicit base records a conflict and preserves current data.
- Missing records return not-found / nil on current query paths and must not be claimed as success.

Acceptance examples for a future editor:
- Edit title + folder + page + genres in one save with current base T1 -> applied, new token T2, detail refreshes, one sync event.
- Edit progress from 11 to 12 on an anime with `totalcap=12` -> resulting state is consistent with completion rules.
- Edit schedule from `["Viernes"]` to `["Sin ver","Ver hoy"]` -> ordered `dias[]` is replaced once and preserved through sync.

Rejection examples for a future editor:
- Save with stale base T1 while current is T2 -> conflict result, no append, editor reloads authoritative data.
- Set `nrocapvisto=-1` -> rejected.
- Set `estado=9` -> rejected.
- Attempt to edit `_id`, `repetir`, or `modified_at` -> rejected as non-user fields.

Code-versus-artifact drift found during exploration:
- `openspec/config.yaml` still describes a starter scaffold and old React/Vite versions; runtime truth is newer and implemented.
- Archived SDD-49 is titled `repeat-restore-edit`, but its proposal explicitly says the general multi-field editor was out of scope.
- Desktop mutation UX is inconsistent today: AnimeDetail interprets OCC outcomes, ChapterSchedule only checks transport `status`, and `frontend/src/infrastructure/season-source/season-source.helpers.ts` hardcodes `base=0` for `SetAnimeDays`.
- `App.GetAnimeDetail` returns the flat `MobileAnime` DTO, while `GetAnimeDetailView` exists but has no frontend consumer.

### Affected Areas
- `internal/anime/write_service.go` — existing canonical patch path; the general editor should reuse this write boundary instead of inventing a parallel file writer.
- `internal/anime/legacy/gateway.go` — owns OCC, round-trip merge, staged append recovery, and conflict recording.
- `internal/anime/domain/anime.go` — currently exposes setters only for a subset of fields; broader editing needs explicit domain-owned mutations.
- `internal/api/contracts/contracts.go` — current `AnimePatch` shape is mobile-oriented and too narrow for a real desktop editor.
- `app_runtime.go` — Wails binding surface where a dedicated `EditAnime` command or editor-specific binding would live.
- `frontend/src/infrastructure/bridge-runtime-source/*` — runtime source contracts and graceful-degradation layer for any new editor binding.
- `frontend/src/features/anime-detail/ui/AnimeDetail/*` — current desktop integration point if editing starts from the detail page.
- `frontend/src/features/catalog/ui/CatalogPanel/*` and `frontend/src/features/history/ui/HistoryTable/*` — likely launch points to open the editor from list/detail navigation.
- `internal/sync/changelog_recorder.go` and `internal/realtime/hub.go` — downstream sync/event surfaces that should keep working unchanged when edits publish one canonical `anime.changed`.

### Approaches
1. **Dedicated desktop EditAnime command over the existing gateway** — Add an editor-specific read/write contract, keep one save action atomic, and map it to one `WriteService` patch.
   - Pros: preserves the single Legacy boundary, matches OCC/event/outbox behavior, gives the UI one authoritative outcome, and avoids partial saves.
   - Cons: requires widening domain setters and contracts, plus deciding exact validation for nullable metadata and date fields.
   - Effort: High

2. **Compose the editor from existing field-specific commands** — Reuse `SetAnimeState`, `SetAnimeDays`, chapter adjustments, and specialized actions from the frontend.
   - Pros: smaller backend diff at first glance.
   - Cons: no atomic save, poor conflict ergonomics, duplicate sync events, partial-success risk, and several target fields still have no command at all.
   - Effort: Medium

### Recommendation
Use a dedicated desktop `EditAnime` flow backed by one canonical write through `WriteService` and `legacy.Gateway.Update`. Add an editor-specific DTO that keeps English application naming, carries the full editable snapshot, and preserves explicit OCC. Keep the frontend entry on AnimeDetail first, then optionally expose launch actions from Catalog/History. Do not build the editor as a bundle of separate existing commands.

### Risks
- Current detail DTO loses fidelity for `estudios` and does not model the full `portada` object, so a naive editor contract would be lossy.
- Completion-state enforcement currently lives clearly on the HTTP path; desktop edit semantics need a single authoritative place for the same rule.
- Existing desktop mutation surfaces already show OCC inconsistency, so copying one of those patterns would bake more drift into the new editor.
- Nullable legacy metadata (`totalcap`, `duracion`, date wrappers, empty-string array conventions) needs precise validation and serialization rules to avoid corrupting `animes.dat`.

### Ready for Proposal
Yes — the runtime shape, boundaries, risks, and drift are clear enough to propose a dedicated editor change. The proposal should explicitly define the editable field set, OCC contract, DTO fidelity rules for `estudios`/`portada`, and where completion-state validation lives for desktop writes.
