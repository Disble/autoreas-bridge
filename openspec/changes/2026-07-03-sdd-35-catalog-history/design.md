# Design — 2026-07-03-sdd-35-catalog-history

## Context (runtime truth)

Verified against the code, not the proposal wording. Two proposal assumptions are
DRIFT and are corrected here (code wins):

- **`GetMobileAnime` is NOT a Wails binding.** It is a service method on
  `contracts.AnimeQueryService` (`internal/anime/service.go:182`) already reachable over
  HTTP (`internal/api/router.go:197`, mobile feed). It ALREADY returns the rich
  `contracts.MobileAnime` (all detail fields). The proposal's "new detail query method
  paralleling `GetMobileAnime`" is therefore unnecessary — the query method exists; only a
  Wails wrapper is new. The desktop Wails binding to parallel is `GetAnimes`
  (`app_runtime.go:94`), which today truncates to the slim `AnimeListItem`.
- **Routing is react-router v7 declarative** (`frontend/src/App.tsx`: `<Routes>/<Route>`),
  NOT `createBrowserRouter` data routes. Detail/history routes are added as nested
  `<Route>` elements.

Current surface facts:
- `LegacyAnimeRaw` (`internal/anime/domain/anime_raw.go`) has typed fields for every detail
  attribute EXCEPT `repetir`, which is silently captured in the untyped `extraFields`
  map and round-tripped verbatim. Legacy fields use a tri-state `rawField`
  (absent / null / value) with per-type wrappers (`LegacyDateField`, `LegacyNumberField`,
  `LegacyAnimeDaysField`) in `internal/anime/domain/anime_raw_fields.go`.
- `MarshalJSON` copies `extraFields` first, then overlays each typed field via
  `assignOptionalField` — so promoting `repetir` to a typed field overwrites (not
  duplicates) the extraFields copy, preserving byte round-trip. The round-trip approval
  tests (`anime_raw_roundtrip_test.go`, `anime_raw_refactor_approval_test.go`) are the guard.
- `mobileAnimeFromSnapshot` (`internal/anime/mobile.go:17`) is the single normalizer that
  builds `MobileAnime` from canonical JSON; `GetMobileAnime` and `ListMobileAnimes` both
  route through it, while `ListAnimeItems` projects the same result down to the slim
  `AnimeListItem`.
- Frontend inventory data flows: `use-anime-panel.ts` → `bridgeRuntimeSource.getAnimes()`
  → Wails `GetAnimes`. Feature `.tsx` files are dumb; the hook owns fetch/effect.
- Bottom nav (`AppLayout.tsx` `NAV_ITEMS`) is a fixed 7-entry array shared by the desktop
  rail and the mobile tab bar. Adding an 8th entry is off the table.
- Real fixture (`resources/autoreas-data/animes.dat`, 795 records): `repetir` is present in
  every record as a JSON ARRAY. 743 are `[]`; 52 carry one-or-more repetition objects, each
  shaped `{numrepeticion:int, nrocapvisto:number, estado:int, fechaCreacion, fechaEstreno,
  fechaUltCapVisto, fechaEliminacion, fechaRepeticion}` where the five `fecha*` are legacy
  `{"$$date":ms}` wrappers OR `null`. Several of the 52 hold multiple entries (lines 187,
  257, 792).

Import/architecture direction stays inside the existing `anime` hexagon; no new backend
package or port is introduced.

## Decision 1 — Mobile IA: segmented Catalog/History lens + drill-down detail (no 8th tab)

The "Animes" nav entry is renamed **Catalog** and becomes a two-lens surface. A segmented
control at the top of the surface switches between:
- **Catalog** — the raw synchronized inventory (today's `AnimePanel`, unchanged behavior).
- **History** — the progress/repetition workflow lens over the same anime set.

Both lenses drill into a shared **Anime Detail** full-screen route. Route shape (declarative,
collision-safe by construction):

```
/catalog                 -> Catalog lens (inventory list)
/catalog/history         -> History lens (progress/repetition list)
/catalog/detail/:id      -> shared Anime Detail (reached from EITHER lens)
```

`detail/:id` is parked under a STATIC `detail/` prefix so the `:id` param can never shadow
the literal `history` segment (a bare `/catalog/:id` would match `/catalog/history`). The
segmented control renders only on the two list routes; the detail route is a full view with a
back affordance.

**Why this over the alternatives:**
- **8th bottom-nav tab — REJECTED.** Nav is locked at 7 (success criterion + `NAV_ITEMS`
  contract). An 8th tab crowds the mobile tab bar and mis-frames History as a peer
  destination when it is a *lens on the same dataset*.
- **Pure drill-down with no History entry point — REJECTED.** History needs a discoverable
  list surface (which animes have repetition history), not only a per-anime tab inside detail.
- **Segmented control (CHOSEN).** Communicates "two views of one catalog," keeps nav at 7,
  and makes the shared detail the natural convergence hub — satisfying the user's explicit
  "shared detail" request with the least IA cost.

## Decision 2 — Shared Anime Detail as its own feature; both lenses reach it by route

Three feature folders under `frontend/src/features/` (strict colocation):

- `features/catalog/` — the renamed inventory lens (see Decision 5).
- `features/history/` — the History lens list.
- `features/anime-detail/` — the SHARED detail, owned by neither lens.

`features/anime-detail/ui/AnimeDetail/` holds the dumb `AnimeDetail.tsx` + colocated
`use-anime-detail.ts`, `anime-detail.helpers.ts`, `anime-detail.types.ts`,
`anime-detail.constants.ts`, `index.ts`, `__tests__/`. **The `use-anime-detail.ts` hook owns
the `GetAnimeDetail` call** (fetch + effect live in the hook, per the strict hook anatomy);
the `.tsx` stays a pure HeroUI/Tailwind render of the returned view model.

Convergence mechanism: the detail is reached purely by route, so Catalog and History share ONE
implementation with zero coupling to each other. `AnimeDetailRoute` (in `app/routes/`, thin
composition) reads the `:id` via `useParams` and renders `<AnimeDetail animeId={id} />`;
`useParams` is routing composition (not state/effect, not a Wails call), which the
`app/**` "delivery/composition only" constraint permits. Both list lenses navigate via
react-router `Link`/`useNavigate` to `/catalog/detail/:id`.

**Rejected alternative:** placing detail inside `features/catalog/` and importing it from
`features/history/`. That makes History depend on Catalog's internals and violates the
"shared, owned by neither" intent. A standalone feature is the screaming-architecture fit.

## Decision 3 — `repetir` as a typed tri-state field mirroring `LegacyAnimeDaysField`

Add a first-class `Repetir LegacyRepetirField` to `LegacyAnimeRaw`, modeled exactly on the
existing `LegacyAnimeDaysField` (raw tri-state + typed slice):

```go
type LegacyRepeticion struct {
    NumRepeticion    LegacyNumberField `json:"numrepeticion,omitempty"`
    NroCapVisto      LegacyNumberField `json:"nrocapvisto,omitempty"`
    Estado           LegacyNumberField `json:"estado,omitempty"`
    FechaCreacion    LegacyDateField   `json:"fechaCreacion,omitempty"`
    FechaEstreno     LegacyDateField   `json:"fechaEstreno,omitempty"`
    FechaUltCapVisto LegacyDateField   `json:"fechaUltCapVisto,omitempty"`
    FechaEliminacion LegacyDateField   `json:"fechaEliminacion,omitempty"`
    FechaRepeticion  LegacyDateField   `json:"fechaRepeticion,omitempty"`
}

type LegacyRepetirField struct {
    raw rawField
    val []LegacyRepeticion
}
```

Each sub-field REUSES `LegacyDateField`/`LegacyNumberField`, so the `{"$$date":ms}`-or-`null`
tolerance and absent-safety already tested for the top-level fields apply verbatim to the
nested repetition entries — no new date/number parsing logic is written.

**Tolerant-parse contract (grounds the "shape varies" risk in the real 795 rows):**
- absent / `null` → `IsAbsent()`/`IsNull()`; typed slice is `nil`; projection yields empty.
- `[]` (743 of 795) → value state, empty slice; projection yields empty timeline.
- `[{...},...]` (52 of 795) → typed entries; individual `null` `fecha*` degrade to nil-time
  via `LegacyDateField.Time()`; unknown/extra keys inside an entry are ignored by struct
  unmarshal (never fail the row).
- Malformed non-array `repetir` (not seen in fixture, defensively handled): the field
  unmarshal returns the error to the caller exactly as sibling fields do — the row fails loud
  rather than silently dropping, consistent with existing `Unmarshal*` call sites in
  `anime_raw.go`. This matches the project's "fail loudly on truly malformed legacy data"
  posture; empty/absent is the ONLY silently-tolerated shape.

**Round-trip preservation (critical gotcha):** wire `repetir` into `UnmarshalJSON` and add
`assignOptionalField(fields, "repetir", r.Repetir.raw)` in `MarshalJSON`. Because MarshalJSON
seeds from `extraFields` then overlays typed fields, the typed overlay replaces the extraFields
copy and the byte round-trip is preserved — the approval/round-trip tests must stay green
unchanged (that is the proof).

Projection: add `func (r LegacyAnimeRaw) Repeticiones() []MobileRepeticion` in
`anime_raw_projection.go` (mirrors `EstudiosString`/`DiasStrings`), converting typed legacy
entries to the contract DTO (dates → `*int64` millis via the same `timeToMillis` seam used in
`mobile.go`).

## Decision 4 — `GetAnimeDetail(id)` reuses `GetMobileAnime`; `MobileAnime` IS the detail DTO

No new service method, no parallel `AnimeDetail` struct. `MobileAnime` already carries every
rich field; we extend it with the repetition timeline and expose the EXISTING `GetMobileAnime`
through a new Wails binding.

Contract (`internal/api/contracts/contracts.go`):
```go
type MobileRepeticion struct {
    NumRepeticion    int    `json:"numrepeticion"`
    NroCapVisto      float64 `json:"nrocapvisto"`
    Estado           int    `json:"estado"`
    FechaCreacion    *int64 `json:"fechaCreacion,omitempty"`
    FechaEstreno     *int64 `json:"fechaEstreno,omitempty"`
    FechaUltCapVisto *int64 `json:"fechaUltCapVisto,omitempty"`
    FechaEliminacion *int64 `json:"fechaEliminacion,omitempty"`
    FechaRepeticion  *int64 `json:"fechaRepeticion,omitempty"`
}
// MobileAnime gains:
Repetir []MobileRepeticion `json:"repetir,omitempty"`
```
`omitempty` keeps the 743 empty-timeline records byte-identical on the mobile feed (additive,
mobile ignores unknown keys — safe). The slim `AnimeListItem` does NOT gain `repetir`; the
inventory list stays lightweight — the timeline is a detail-only concern.

Service (`internal/anime/mobile.go`): `mobileAnimeFromSnapshot` sets
`item.Repetir = raw.Repeticiones()`. `GetMobileAnime` / `ListMobileAnimes` inherit it for
free. No interface change to `AnimeQueryService` (`GetMobileAnime` is already on it).

Wails binding (`app_runtime.go`, parallels `GetAnimes`):
```go
func (a *App) GetAnimeDetail(id string) *contracts.MobileAnime {
    if a.animeQuery == nil {
        return nil
    }
    item, err := a.animeQuery.GetMobileAnime(a.appContext(), id)
    if err != nil {
        return nil // not-found / error degrade to null, matching GetAnimes' empty-on-error posture
    }
    return item
}
```
Regenerate Wails bindings (`wails generate module` / existing codegen workflow) so
`frontend/wailsjs/go/main/App` exposes `GetAnimeDetail` — same workflow used when `GetAnimes`
was added.

TS mirror:
- `frontend/src/shared/contracts/anime.types.ts`: add `AnimeRepeticion` interface (all
  `readonly`) + an `AnimeDetail` interface (readonly, superset of `Anime` plus the rich
  fields already on `MobileAnime` that detail needs, plus `readonly repetir: readonly
  AnimeRepeticion[]`).
- `frontend/src/infrastructure/bridge-runtime-source.ts`: add
  `readonly getAnimeDetail: (id: string) => Promise<AnimeDetail | null>` to the
  `BridgeRuntimeSource` port and implement it via `waitForBindings(() =>
  hasGoBinding('GetAnimeDetail'))` → `GetAnimeDetail(id)`, degrading to `null` when the
  runtime is unavailable (mirrors the existing guarded-binding pattern).

## Decision 5 — Rename folder AND user-facing surface; keep backend identifiers

Frontend `features/anime/` → `features/catalog/` (folder + component names:
`AnimePanel` → `CatalogPanel`, `AnimeFilterBar` → `CatalogFilterBar`, route
`AnimeRoute` → `CatalogRoute`). Screaming-architecture: the folder name must name the
capability, and "catalog" is now the durable name. The churn is mechanical (import-path +
rename tracked by git), contained to slice 2, and pays for itself in clarity for the History
split.

User-facing: nav label `Animes` → `Catalog`, route `/animes` → `/catalog`, header copy in
English ("Catalog" / "Browse the synchronized anime inventory").

**Backend identifiers stay UNCHANGED:** `GetAnimes` Wails binding, `AnimeListItem` contract,
`ListAnimeItems` service method, `getAnimes` source method. Renaming them is churn with no
user-visible payoff and would break the proposal's "keep `GetAnimes`/`AnimeListItem` intact"
guarantee that keeps existing tests green. The rename is a PRESENTATION concern; the backend
inventory query keeps its name.

**Rejected alternative:** rename only the user-facing surface, leave `features/anime/`. Cheaper
but leaves the folder name lying about its role once History exists as a sibling — the exact
readability debt this change is meant to remove.

## Decision 6 — Slice boundaries (confirm proposal's 3 slices, each independently green)

| Slice | Scope | Independently-green proof |
|---|---|---|
| **1 — Backend data/DTO/binding** (~250) | `LegacyRepetirField` + `LegacyRepeticion` (RED fixture test first), `LegacyAnimeRaw.Repetir` + Unmarshal/Marshal round-trip, `Repeticiones()` projection, `MobileRepeticion` + `MobileAnime.Repetir`, `mobileAnimeFromSnapshot` threading, `GetAnimeDetail` Wails binding + codegen, TS `AnimeDetail`/`AnimeRepeticion` + `getAnimeDetail` source method | `go test ./...` green (round-trip approval tests unchanged prove no drift); binding returns real repetition data validated against `animes.dat`; no UI surface touched yet |
| **2 — Catalog rename + shared Detail scaffold** (~150) | Folder `anime`→`catalog` rename, nav label/route `/animes`→`/catalog`, `CatalogRoute`, `features/anime-detail/` scaffold + `use-anime-detail` consuming `getAnimeDetail`, `/catalog/detail/:id` route, drill-down from Catalog list | Catalog renders renamed with unchanged filter/search; detail reachable from Catalog; `vitest` green |
| **3 — History lens** (~300) | `features/history/` list, `/catalog/history` route, segmented Catalog/History control host, drill-down from History into the SHARED detail | History lists animes with repetition/progress from real data; segmented control switches lenses; detail reachable from History; nav still 7; `vitest` green |

Slice 1 ships value (desktop detail data) with zero frontend risk. Slice 2 is green even
before History exists (detail works from Catalog alone). Slice 3 only ADDS a lens + route over
the slice-2 hub. Each slice keeps every gate green (Strict TDD, gofmt, golangci-lint, filesize
warn-400/fail-500, ESLint) and is a coherent chained-PR unit.

## Testing strategy (Strict TDD)

1. **RED first, backend:** unit-test `LegacyRepetirField` unmarshal/marshal (absent, null,
   `[]`, single, multi-entry, null-`fecha*`) and `Repeticiones()` projection with in-line
   JSON, THEN a real-fixture test that parses `resources/autoreas-data/animes.dat` and asserts
   the 52 non-empty timelines (and that the 743 empty ones project to empty). The existing
   `anime_raw_roundtrip_test.go` / `anime_raw_refactor_approval_test.go` are the REGRESSION NET
   — they must pass unchanged, proving `repetir` promotion preserved byte round-trip.
2. **RED first, frontend:** colocated `__tests__/` for `use-anime-detail` (loading, loaded,
   null/not-found, runtime-unavailable), `anime-detail.helpers` (view-model mapping, empty vs
   populated timeline), the History lens hook/helpers, and the segmented-control routing.
   Feature `.tsx` render tests assert dumb rendering only.
3. **Package + gates:** `go test ./internal/anime/... ./internal/api/...` plus the full suite;
   `bun --cwd=frontend run test`; then the pre-commit gate (gofmt, golangci-lint,
   `go run ./tools/checkgofilesize`, `bun --cwd=frontend run filesize:warning`, ESLint).

## Risks / mitigations

- **`repetir` shape variance** → mirrored tri-state field + real-`animes.dat` fixture test; only
  empty/absent is silently tolerated, malformed arrays fail loud like sibling fields.
- **Round-trip regression from promoting an extraFields key** → MarshalJSON overlay ordering
  preserves bytes; approval/round-trip tests are the unchanged guard.
- **Route collision `history` vs `:id`** → static `detail/` prefix removes ambiguity by
  construction.
- **Rename churn breaking `GetAnimes`/binding tests** → backend identifiers untouched; rename
  is presentation-only; `AnimeListItem`/`ListAnimeItems` intact.
- **Wails codegen friction** → `GetAnimeDetail` follows the exact `GetAnimes` binding + codegen
  workflow; degrade-to-null keeps the frontend safe before regeneration lands.
- **File-size (warn 400 / fail 500)** → new field type lives in `anime_raw_fields.go` (small
  additive); detail/history split across colocated feature files keeps every `.tsx`/hook well
  under budget.

## Open assumptions requiring validation in apply

- History lens content model: which animes qualify (has-repetition vs all-with-progress) and
  the timeline ordering (by `fechaRepeticion` desc assumed). Confirm against product intent in
  slice 3; the backend already surfaces the raw timeline so this is a pure frontend decision.
- Whether `AnimeDetail` TS should be a discriminated superset of `Anime` or a standalone
  interface — resolve in slice 1 when the exact rendered field set is fixed.
