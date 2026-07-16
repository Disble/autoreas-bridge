# Design: Edit Anime

## Technical Approach

Add one authoritative `anime-editor` workflow on top of the existing `WriteService -> legacy.Gateway -> append/outbox` path, and replace Season's partial weekday scheduler with one schedule-specific core that supports both Season and Anime Editor. The editor uses explicit OCC on `modified_at`; schedule apply uses whole-draft OCC across every touched anime. Runtime code remains the authority; `openspec/config.yaml` context drift is ignored.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Editor DTO | Introduce dedicated read/write editor DTOs, separate from `MobileAnime` | Current detail DTO is lossy: `estudios` is flattened and `portada` is reduced to one string. |
| OCC boundary | Validate `base modified_at` only in application write services | One seam keeps `applied/no_op/conflict/error` behavior consistent across Wails, HTTP, and future callers. |
| Schedule apply | New anime-context bulk schedule command, not repeated Season `SetAnimeDays` calls | Current Season flow is partial and base-less. The new contract must reject stale drafts atomically. |
| DnD reuse | Extract a domain-specific `AnimeScheduleOrdering` core with thin Season and Anime Editor adapters | Reuse the proven board logic without turning it into a generic callback framework. |

## Data Flow

### General editor save

```text
AnimeEditorRoute -> use-anime-editor -> bridgeRuntimeSource.saveAnimeEditor
  -> Wails App.SaveAnimeEditor
  -> anime.EditorService.Save(cmd{anime_id, base, patch})
  -> legacy.Gateway.Update(merge changed fields into original raw envelope)
  -> append once -> finalize write base/outbox -> publish anime.changed once
  -> changelog recorder -> websocket hub
```

### Bulk schedule apply

```text
AnimeScheduleModal -> use-anime-schedule-ordering -> saveAnimeScheduleDraft? local only
  -> App.ApplyAnimeScheduleDraft
  -> anime.ScheduleService.ApplyBulk(cmd{bases[], changes[]})
  -> validate every base against current authority
  -> if any stale/invalid: reject whole draft, append nothing, publish nothing
  -> else persist changed records in one transaction-like gateway unit
  -> publish after all durable appends finalize
```

### Schedule modal load

```text
AnimeEditorRoute(/editor or /editor/:id)
  -> use-anime-schedule-modal
  -> bridgeRuntimeSource.getAnimeEditorScheduleBoard(originAnimeId?)
  -> Wails App.GetAnimeEditorScheduleBoard(originAnimeID string)
  -> anime.ScheduleQueryService.GetEditorBoard(query{origin anime})
  -> QueryService.ListReadRecords(active only) + destination metadata
  -> return authoritative board rows + per-record base modified_at tokens
```

## Interfaces / Contracts

### Editor read DTO

```ts
type LegacyNullableText = string | null | undefined;
type LegacyNullableNumber = number | null | undefined;
interface LegacyPortadaDto { readonly type?: string; readonly path?: string; readonly raw?: unknown }
interface LegacyStudiosDto { readonly kind: 'missing' | 'null' | 'empty' | 'values'; readonly values: readonly string[] }
interface AnimeEditorRecord {
  readonly animeId: string;
  readonly modifiedAt: number;
  readonly frequent: { readonly nombre: string; readonly estado: number; readonly nrocapvisto: number; readonly totalcap?: number | null; readonly activo: boolean; readonly tipo?: number | null; readonly pagina?: LegacyNullableText; readonly carpeta?: LegacyNullableText; readonly dias: readonly { readonly dia: string; readonly orden: number }[] };
  readonly details: { readonly fechaEstreno?: number | null; readonly duracion?: LegacyNullableNumber; readonly origen?: LegacyNullableText; readonly generos: readonly string[]; readonly estudios: LegacyStudiosDto; readonly portada: LegacyPortadaDto | null };
}
```

Nullable matrix: preserve missing vs `null` for `fechaEstreno`, `duracion`, `tipo`, `pagina`, `carpeta`, `origen`, `estudios`, `generos`, `portada`. `estudios` keeps array fidelity plus missing/null distinction. `portada` keeps the legacy object shape; empty-path sentinel stays `{type:"url",path:""}` only when already present or required by create semantics.

### Editor write DTO

```go
type SaveAnimeEditorCommand struct {
  AnimeID string
  BaseModifiedAt int64
  Patch EditorPatch
}

type EditorNullableStringPatch struct {
  Present bool
  Clear bool
  Value string
}

type EditorNullableIntPatch struct {
  Present bool
  Clear bool
  Value int
}

type EditorNullableFloatPatch struct {
  Present bool
  Clear bool
  Value float64
}

type EditorNullableTimePatch struct {
  Present bool
  Clear bool
  UnixMilli int64
}

type EditorStudiosPatch struct {
  Present bool
  Clear bool
  Values []string
}

type EditorPortadaPatch struct {
  Present bool
  Clear bool
  Type string
  Path string
  Raw map[string]json.RawMessage
}

type EditorPatch struct {
  Nombre *string
  Estado *int
  NroCapVisto *float64
  TotalCap EditorNullableIntPatch
  Tipo EditorNullableIntPatch
  Activo *bool
  Pagina EditorNullableStringPatch
  Carpeta EditorNullableStringPatch
  Dias []contracts.MobileAnimeDay
  FechaEstreno EditorNullableTimePatch
  Duracion EditorNullableIntPatch
  Origen EditorNullableStringPatch
  Generos *[]string
  Estudios EditorStudiosPatch
  Portada EditorPortadaPatch
}
```

Editable ownership: `nombre, estado, nrocapvisto, totalcap, tipo, activo, pagina, carpeta, dias, fechaEstreno, duracion, origen, generos, estudios, portada`. Forbidden: `_id`, `modified_at`, `repetir`, `primeravez`, lifecycle history. `activo=false` is exposed only as **Deactivate anime**.

Patch semantics: omitted field => preserve raw envelope exactly; `Present && Clear` => write explicit legacy `null` except `estudios` and `generos`, which preserve current missing/null style when clearing to empty unless the authoritative raw value is already explicit `null`; `Generos=nil` omitted, `&[]string{}` explicit empty array; `Estudios.Clear` means preserve structured field ownership but emit empty list or `null` according to the loaded read DTO kind; `Portada.Clear` emits the same legacy object shape with empty-path sentinel when the record currently owns a portada object, never a plain string. The read DTO feeds write defaults: save operations begin from the loaded authoritative `AnimeEditorRecord`, and `EditorPatch` expresses only deltas.

### Schedule modal read-side contract

```go
type GetAnimeEditorScheduleBoardQuery struct {
  OriginAnimeID string
}

type AnimeScheduleDestination struct {
  ID string
  Label string
  Kind string // weekday | special
}

type AnimeScheduleBoardEntry struct {
  AnimeID string
  Nombre string
  Activo bool
  ModifiedAt int64
  Placements []contracts.MobileAnimeDay
  Estado int
  NroCapVisto float64
  Portada *string
  OriginHighlighted bool
}

type AnimeEditorScheduleBoard struct {
  OriginAnimeID string
  Destinations []AnimeScheduleDestination
  Entries []AnimeScheduleBoardEntry
}
```

Wails load binding: `GetAnimeEditorScheduleBoard(originAnimeID string) AnimeEditorScheduleBoardDTO`. It returns all active anime, authoritative current placements, fixed destination metadata for weekdays plus `Sin ver` / `Ver hoy` / `Visto`, and each row's `ModifiedAt` base token so the modal can build one whole draft safely.

### Bulk schedule contract

```go
type ApplyAnimeScheduleDraftCommand struct {
  Entries []struct {
    AnimeID string
    BaseModifiedAt int64
    Placements []contracts.MobileAnimeDay // weekday or Sin ver/Ver hoy/Visto
  }
}
```

Rules: all active anime are loaded into one draft; only changed records are submitted; each destination order must be unique and contiguous after normalization; if any base is stale, reject all with refreshed authority payload.

Wails apply binding: `ApplyAnimeEditorSchedule(command ApplyAnimeScheduleDraftCommandDTO) AnimeEditorScheduleApplyResultDTO`, where outcome is `applied | no_op | conflict | error` for the draft as a whole and conflict/error returns refreshed `AnimeEditorScheduleBoardDTO` authority.

## UI / Boundary Design

```text
+---------------- Anime Editor ----------------+
| Search + watching-first filters | header*   |
| scrollable list                 | form      |
| selected row                    | frequent  |
| dirty badge                     | More...   |
|                                  --------- |
|                                  sticky [Deactivate][Discard][Save]
+---------------------------------------------+
* independent list/form scrolling
```

- New route: `/editor` plus deep-link `/editor/:id`; Anime Detail gets **Edit anime** and navigates there. Catalog and History ownership stays unchanged.
- First-class navigation entry is explicit: add `{ to: '/editor', label: 'Anime Editor', icon: <editorIcon> }` to `frontend/src/shared/navigation/app-layout.constants.ts` in `APP_LAYOUT_NAV_ITEMS`, register both `/editor` and `/editor/:id` in `frontend/src/App.tsx`, and keep `frontend/src/app/routes/AnimeDetailRoute.tsx` as the shared read-only detail route. Anime Detail deep-link behavior becomes `navigate('/editor/' + animeId)` from a dedicated **Edit anime** action.
- Feature structure: `frontend/src/features/anime-editor/...` and `frontend/src/features/anime-schedule-ordering/...`; `.tsx` files stay dumb, hooks hold logic, helpers get JSDoc, tests land before hook/helper edits.
- Use HeroUI `SearchField`, `ToggleButtonGroup`, `Card`/`Surface`, `Alert`, `Modal`, `ScrollShadow`, `Button onPress`.
- Unsaved-change guard covers selection change, route change, modal entry, window close, reload, and host interceptable navigation.
- Schedule modal is near-full-screen, global, highlights origin anime, scrolls it into view, shows weekdays plus `Sin ver`, `Ver hoy`, `Visto`, and exposes only whole-draft `Reset` / `Apply schedule`.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/edit-anime/design.md` | Create | This design artifact |
| `frontend/src/shared/navigation/app-layout.constants.ts` | Modify | Add the first-class `/editor` navigation item in `APP_LAYOUT_NAV_ITEMS` |
| `frontend/src/App.tsx` | Modify | Register `/editor` and `/editor/:id` routes |
| `frontend/src/app/routes/AnimeEditorRoute.tsx` | Create | Thin composition route for the dedicated editor section |
| `internal/anime/editor_service.go` | Create | General editor application service |
| `internal/anime/schedule_service.go` | Create | Atomic bulk schedule OCC service |
| `internal/anime/schedule_query_service.go` | Create | Read-side board query for the global schedule modal |
| `internal/api/contracts/contracts.go` | Modify | Add editor DTOs and schedule-board/apply DTOs |
| `internal/anime/legacy/{wire,mapper,gateway}.go` | Modify | Full-fidelity read/write mapping for `estudios`, `portada`, unknown fields |
| `app_runtime.go` | Modify | Add `GetAnimeEditorRecord`, `SaveAnimeEditor`, `DeactivateAnime`, `GetAnimeEditorScheduleBoard`, `ApplyAnimeEditorSchedule` bindings |
| `frontend/src/infrastructure/bridge-runtime-source/{bridge-runtime-source.types.ts,bridge-runtime-source.helpers.ts}` | Modify | Expose the new editor and schedule runtime calls |
| `frontend/src/features/anime-editor/**` | Create | Split-pane editor UI, hook, helpers, tests |
| `frontend/src/features/anime-schedule-ordering/**` | Create | Reusable schedule-specific core |
| `frontend/src/features/season/ui/OrderingBoard/**` | Refactor | Thin season adapter over the new core |
| `frontend/src/features/anime-detail/ui/AnimeDetail/**` | Modify | Add Edit anime entry only |

### Wails integration contract

- `GetAnimeEditorRecord(animeID string) AnimeEditorRecordDTO | nil` -> authoritative load for the right-side form.
- `SaveAnimeEditor(command SaveAnimeEditorCommandDTO) AnimeEditorSaveResultDTO` -> semantic outcome `applied | no_op | conflict | error`, refreshed record on success/conflict.
- `DeactivateAnime(animeID string, baseModifiedAt int64) AnimeEditorSaveResultDTO` -> specialized semantic wording for `activo=false`, same OCC outcomes.
- `GetAnimeEditorScheduleBoard(originAnimeID string) AnimeEditorScheduleBoardDTO` -> active-anime board load with per-record bases.
- `ApplyAnimeEditorSchedule(command ApplyAnimeScheduleDraftCommandDTO) AnimeEditorScheduleApplyResultDTO` -> whole-draft `applied | no_op | conflict | error`, refreshed board on conflict.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Go unit | DTO merge matrix, OCC outcomes, stale whole-draft rejection | table-driven tests with fixture payloads from `animes.dat` |
| Go integration | one append/outbox/event/changelog broadcast, zero publication on invalid/stale/failure | temp file + SQLite + outbox assertions |
| Frontend unit | dirty guard reducer/helpers, modal draft normalization, validation, route deep-linking | Vitest hook/helper tests before implementation |
| Frontend component | split-pane rendering, sticky actions, wording, conflict banners | React Testing Library |

## Migration / Rollout

No data migration required. Implementation sequence:
1. RED tests for lossless editor DTO + bulk schedule OCC.
2. Backend editor contracts and legacy merge fixes.
3. Backend bulk schedule service and Season adapter migration.
4. Frontend schedule core extraction.
5. Frontend Anime Editor route, deep-link, guard, modal wiring.

Forecast: the single-PR preference is HIGH RISK for an 800-line review budget because this slice touches backend DTOs, Wails bindings, Season refactor, and new frontend features. Keep one PR only if commits stay tightly sliced; a chained PR is safer if the diff grows.

## Acceptance / Rejection Examples

- Accept: rename + origin edit with unchanged unknown raw fields -> one append, one `anime.changed`, one changelog row, one websocket broadcast.
- Accept: schedule draft changes only anime A and C -> only A and C append.
- Reject: editor save drops legacy unknown JSON, rewrites `estudios` string, or collapses `portada` object.
- Reject: any stale base in bulk schedule -> whole draft rejected, authority reloaded, zero partial writes.
- Reject: duplicate destination positions, misleading delete wording, lifecycle controls inside editor form, Wails/business logic inside feature `.tsx`, Catalog/History ownership drift.

## Open Questions

- None. The remaining work is implementation and task slicing.
