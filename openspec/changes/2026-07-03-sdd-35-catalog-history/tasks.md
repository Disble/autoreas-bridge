# Tasks — 2026-07-03-sdd-35-catalog-history

Strict TDD: write/adjust the failing test FIRST in each step, then implement to green.
`anime_raw_roundtrip_test.go` + `anime_raw_refactor_approval_test.go` are the REGRESSION NET for
slice 1 and MUST stay green unchanged throughout (proof that promoting `repetir` off
`extraFields` preserves the byte round-trip). Existing `GetAnimes`/`ListAnimeItems` tests are the
regression net for slice 2's rename.

Delivery: no PR workflow in this repo — merge to `main` is the release gate. The 3 slices below
ship as chained work-unit commits on branch `feat/catalog-history`, each ending independently
green against the FULL pre-commit gate (gofmt, golangci-lint, `go vet`, `go test` + coverage,
`go run ./tools/checkgofilesize`, ESLint, `tsc`, `vitest`, `bun run filesize:warning`, sdd-gate,
openapi). Orchestrator verifies and commits after each slice — do not batch all 3 into one commit.

## Slice 1 — Backend data / DTO / binding (~250 lines)

### Phase 1.0 — Baseline
- [x] Run `go test ./internal/anime/... ./...` and confirm GREEN before any change. Note current
      `anime_raw_roundtrip_test.go` / `anime_raw_refactor_approval_test.go` pass — this is the
      "before" snapshot the round-trip proof compares against.

### Phase 1.1 — Typed `repetir` field (spec: Anime Detail / "Typed Repetir Field on Legacy Anime Raw")
- [x] RED: `internal/anime/domain/anime_raw_fields_test.go` (new or appended) —
      `TestLegacyRepetirFieldAbsent`, `TestLegacyRepetirFieldNull`, `TestLegacyRepetirFieldEmptyArray`,
      `TestLegacyRepetirFieldSingleEntry`, `TestLegacyRepetirFieldMultiEntry`,
      `TestLegacyRepetirFieldNullFechaDegradesToNilTime`, and
      `TestLegacyRepetirFieldMalformedNonArrayFailsLoud` (mirrors the existing
      `TestLegacyFieldWrappersRejectInvalidTypes` fail-loud posture for sibling fields).
- [x] GREEN: `internal/anime/domain/anime_raw_fields.go` — add `LegacyRepeticion` struct
      (`NumRepeticion`/`NroCapVisto`/`Estado` as `LegacyNumberField`, five `Fecha*` as
      `LegacyDateField`, mirroring `LegacyAnimeDaysField`'s tri-state pattern) and
      `LegacyRepetirField` (`raw rawField` + `val []LegacyRepeticion`) with
      `UnmarshalJSON`/`MarshalJSON`/`IsZero`/`Values()`.
- [x] GREEN: `internal/anime/domain/anime_raw.go` — add `Repetir LegacyRepetirField` to
      `LegacyAnimeRaw`, wire it in `UnmarshalJSON` alongside sibling fields, and add
      `assignOptionalField(fields, "repetir", r.Repetir.raw)` in `MarshalJSON` (placed with the
      other `assignOptionalField` calls — ordering after `extraFields` copy is what preserves the
      round-trip, per design Decision 3).
- [x] Confirm `anime_raw_roundtrip_test.go` + `anime_raw_refactor_approval_test.go` still pass
      UNCHANGED (no test file edits) — this is the round-trip regression proof for promoting
      `repetir` out of `extraFields`.

### Phase 1.2 — Fixture validation (real-boundary test, `bridge-testing` convention)
- [x] RED: real-fixture test parsing `resources/autoreas-data/animes.dat` (795 records) —
      assert all 795 parse without error, exactly 743 project to an empty `Repeticiones()` slice,
      exactly 52 project to a non-empty slice (matches design's verified fixture facts).
- [x] GREEN: `internal/anime/domain/anime_raw_projection.go` — add
      `func (r LegacyAnimeRaw) Repeticiones() []MobileRepeticion` (mirrors `EstudiosString`/
      `DiasStrings`), converting `LegacyRepeticion` entries to the contract DTO, dates via the
      same `timeToMillis`-style seam used in `internal/anime/mobile.go` (note: projection package
      is `internal/anime/domain`, so either duplicate the minimal millis conversion or expose a
      shared helper — decide during implementation, keep it colocated with the other projection
      helpers, not in `mobile.go`).

### Phase 1.3 — `MobileAnime.Repetir` contract + service threading (spec: Anime Detail / "AnimeDetail DTO and GetAnimeDetail Binding")
- [x] RED: `internal/anime/query_service_test.go` — extend/add a case asserting
      `GetMobileAnime` returns a populated `Repetir []MobileRepeticion` for a snapshot whose
      `repetir` has entries, and an empty (not nil-panicking) slice when absent/empty.
- [x] GREEN: `internal/api/contracts/contracts.go` — add `MobileRepeticion` struct (fields per
      design Decision 4: `NumRepeticion int`, `NroCapVisto float64`, `Estado int`, five
      `Fecha* *int64` with `omitempty`) and `Repetir []MobileRepeticion` `json:"repetir,omitempty"`
      on `MobileAnime`. Do NOT add `repetir` to the slim `AnimeListItem` — timeline stays a
      detail-only concern per design.
- [x] GREEN: `internal/anime/mobile.go` — `mobileAnimeFromSnapshot` sets
      `item.Repetir = raw.Repeticiones()`. No `AnimeQueryService` interface change needed
      (`GetMobileAnime` already exposes it).
- [x] Confirm existing `GetAnimes`/`ListAnimeItems` tests remain green (slim DTO untouched) —
      satisfies spec's "GetAnimes/AnimeListItem remain unaffected" scenario.

### Phase 1.4 — `GetAnimeDetail` Wails binding (spec: Anime Detail / "AnimeDetail DTO and GetAnimeDetail Binding")
- [x] RED: `app_runtime_test.go` — `TestGetAnimeDetailReturnsPopulatedDTOForExistingID` and
      `TestGetAnimeDetailReturnsNilForUnknownID` (matches the not-found scenario in the spec: a
      distinguishable nil/null result, not a silent zero-value DTO) and
      `TestGetAnimeDetailReturnsNilWhenAnimeQueryServiceNil` (mirrors the nil-service guard used
      by the other bindings in this file, e.g. `TestPullAnimesFromLegacyReturnsUnavailableWhenServiceNil`).
- [x] GREEN: `app_runtime.go` — add
      ```go
      func (a *App) GetAnimeDetail(id string) *contracts.MobileAnime {
          if a.animeQuery == nil {
              return nil
          }
          item, err := a.animeQuery.GetMobileAnime(a.appContext(), id)
          if err != nil {
              return nil
          }
          return item
      }
      ```
      (parallels `GetAnimes` at `app_runtime.go:94`; additive only, `GetAnimes` untouched).
- [x] Decision (confirm in this task, per design "Open assumptions"): `GetAnimeDetail` returns
      `*contracts.MobileAnime` directly — no new `contracts.AnimeDetail` Go struct — since
      `MobileAnime` is already the rich superset. The spec's "`contracts.AnimeDetail` DTO" language
      is satisfied on the TypeScript side (Phase 1.6); document this Go/TS DTO-naming asymmetry
      inline as a code comment on `GetAnimeDetail` if it isn't self-evident from the signature.
- [x] Regenerate Wails bindings (`wails generate module`, same workflow used for `GetAnimes`) so
      `frontend/wailsjs/go/main/App` exposes `GetAnimeDetail`. Codegen tooling (`wails` CLI v2.12.0)
      was available; ran `wails generate module` directly — no hand-authored stub fallback needed.

### Phase 1.5 — TS contract mirror (spec: Anime Detail / "Shared Detail Component" groundwork)
- [x] RED: colocated test for `bridge-runtime-source.ts` (existing test file for this module) —
      `getAnimeDetail` resolves the mapped DTO when `GetAnimeDetail` binding is present, and
      degrades to `null` when the runtime/binding is unavailable (mirrors the `waitForBindings` +
      `hasGoBinding` pattern already used by `getAnimes`).
- [x] GREEN: `frontend/src/shared/contracts/anime.types.ts` — add `AnimeRepeticion` (all
      `readonly`, mirrors `MobileRepeticion` field names) and `AnimeDetail` (readonly; decision
      resolved here per design's open assumption: standalone interface, NOT a TS superset of
      `Anime` via intersection/extends — because `Anime`'s slim fields (`hasDownloadPage`/
      `hasFolder` booleans) are a different shape than the detail's raw `pagina`/`carpeta`
      string-or-undefined fields; keeping `AnimeDetail` standalone avoids fighting that mismatch).
      DEVIATION from this line's literal wording: `repetir` is typed `readonly repetir?:
      readonly AnimeRepeticion[]` (optional, not required) — the Go contract's `omitempty` on
      `MobileAnime.Repetir` omits the key from the wire payload even for a non-nil empty slice
      (encoding/json's `omitempty` treats zero-length slices as empty), so the field IS actually
      absent on the wire for the ~93% of anime with no repetition history. Typing it as required
      would misrepresent the real payload shape; documented inline in anime.types.ts.
- [x] GREEN: `frontend/src/infrastructure/bridge-runtime-source.ts` — add
      `readonly getAnimeDetail: (id: string) => Promise<AnimeDetail | null>` to the
      `BridgeRuntimeSource` interface, implement via
      `waitForBindings(() => hasGoBinding('GetAnimeDetail'))` → call `GetAnimeDetail(id)` →
      degrade to `null` when unavailable, import `GetAnimeDetail` from `wailsjs/go/main/App`.

### Phase 1.6 — Verify slice 1
- [x] `go test ./internal/anime/... ./...` GREEN — round-trip/approval tests unchanged,
      fixture test asserts 743/52 split.
- [x] `bun --cwd=frontend run test` GREEN for the new `bridge-runtime-source` cases.
- [x] `go run ./tools/checkgofilesize` — no new/touched Go file crosses warn-400/fail-500.
- [x] `bun --cwd=frontend run filesize:warning` — advisory pass on touched TS files.
- [x] gofmt + golangci-lint + `go vet` clean on `internal/anime`, `internal/api/contracts`,
      root (`app_runtime.go`).
- [x] ESLint + `tsc` clean on touched frontend files. (Fixing tsc required updating 4 pre-existing
      `BridgeRuntimeSource` test-mock factories that didn't include the newly-required
      `getAnimeDetail` field: `use-anime-panel.test.ts`, `use-bridge-dashboard.test.ts`,
      `use-bridge-status-card.test.ts`, `use-pairing-panel.test.ts`,
      `use-syncing-anime-panel.test.ts`.)
- [x] **Orchestrator committed slice 1** as `4237339` on `feat/catalog-history`, full gate green.
      No UI surface is touched in this slice — desktop detail data ships with zero frontend risk
      (design Decision 6).

## Slice 2 — Catalog rename + shared Detail scaffold (~150 lines)

### Phase 2.1 — Rename `features/anime/` → `features/catalog/` (spec: Anime / "Catalog Surface Naming and Navigation Entry")
- [x] RED: adjust existing colocated tests under
      `frontend/src/features/anime/ui/{AnimePanel,AnimeFilterBar}/__tests__/` to their post-rename
      import paths/names as a mechanical rename (git tracks it as a move) —
      `AnimePanel` → `CatalogPanel`, `AnimeFilterBar` → `CatalogFilterBar`, folder
      `features/anime/` → `features/catalog/`. This is a rename, not new behavior: the RED step is
      "tests fail to compile/resolve at old paths," GREEN is "tests pass at new paths with
      identical assertions."
- [x] GREEN: perform the rename (folder + component identifiers + imports). Backend identifiers
      (`GetAnimes` binding, `AnimeListItem`, `ListAnimeItems`, `getAnimes` source method) stay
      UNCHANGED per design Decision 5 — confirm no occurrence of the rename touches
      `bridge-runtime-source.ts`'s `getAnimes` method name or `anime.types.ts`'s `Anime` interface
      name. DEVIATION (scoped, low-risk): also renamed the Panel/FilterBar-specific colocated file
      names (`anime-panel.*` → `catalog-panel.*`, `anime-filter-bar.types.ts` →
      `catalog-filter-bar.types.ts`) and their 1:1 component-attached type names
      (`AnimePanelProps`/`AnimePanelState`/`AnimeFilterBarProps` → `CatalogPanelProps`/
      `CatalogPanelState`/`CatalogFilterBarProps`, `ANIME_PANEL_*` constants →
      `CATALOG_PANEL_*`) to keep colocated file names honest post-rename (generator convention:
      kebab file names mirror the component). Kept unchanged: domain-shaped names that mirror
      "Anime" data itself, not panel identity (`AnimeViewModel`, `AnimeStatus`, `AnimeFilterState`,
      `AnimeFilterOption`, all `matchesAnime*`/`toAnimeViewModel` helper names, `ANIME_ESTADO_
      OPTIONS`/`ANIME_ACTIVO_OPTIONS`/`ANIME_GAP_*`/etc.) — consistent with backend `Anime`/
      `AnimeListItem` staying unchanged.
- [x] Confirm `search-filters.md` / `soft-delete.md` behavior is unaffected (spec scenario) — run
      the renamed `CatalogFilterBar`/`CatalogPanel` test suites unchanged in assertions, only
      import paths differ.

### Phase 2.2 — Nav label + route rename (spec: Anime / "Section label reads Catalog")
- [x] RED: update/add a test asserting `AppLayout`'s `NAV_ITEMS` renders label "Catalog" (not
      "Animes") for the `/catalog` entry, and that the nav still has exactly 7 entries (spec:
      Anime History / "Bottom nav entry count unchanged" — this precondition holds already since
      slice 2 renames, not adds, an entry).
- [x] GREEN: `frontend/src/app/AppLayout.tsx` — change `NAV_ITEMS` entry
      `{ to: '/animes', label: 'Animes', ... }` → `{ to: '/catalog', label: 'Catalog', ... }`
      (also renamed the local `AnimeIcon` function to `CatalogIcon` for naming consistency).
- [x] GREEN: `frontend/src/App.tsx` — change `<Route path="/animes" element={<AnimeRoute />} />`
      to `<Route path="/catalog" element={<CatalogRoute />} />` (import renamed from
      `./app/routes/AnimeRoute`); rename `frontend/src/app/routes/AnimeRoute.tsx` →
      `CatalogRoute.tsx`, header copy "Animes" → "Catalog" / "Browse the synchronized anime
      inventory" (English, per design Decision 5).

### Phase 2.3 — `features/anime-detail/` scaffold (spec: Anime Detail / "Shared Detail Component Across Catalog and History")
- [x] Scaffold via `bun --cwd=frontend run generate:feature anime-detail AnimeDetail` (repo
      convention — do not hand-scaffold) producing
      `frontend/src/features/anime-detail/ui/AnimeDetail/{AnimeDetail.tsx,use-anime-detail.ts,
      anime-detail.helpers.ts,anime-detail.types.ts,anime-detail.constants.ts,index.ts,
      __tests__/}`.
- [x] RED: `__tests__/use-anime-detail.test.ts` — loading, loaded (with populated `repetir`),
      null/not-found, and runtime-unavailable states, calling `bridgeRuntimeSource.getAnimeDetail`.
      Documented inline that runtime-unavailable and not-found are the same code path since
      `bridgeRuntimeSource.getAnimeDetail` degrades to `null` for both (never rejects).
- [x] GREEN: `use-anime-detail.ts` — hook owns the `getAnimeDetail(id)` fetch + effect (strict hook
      anatomy: imports, signature, refs, state, context/3rd-party hooks, queries/mutations,
      derived state, callbacks, effects, return).
- [x] RED: `__tests__/anime-detail.helpers.test.ts` — view-model mapping from `AnimeDetail` DTO,
      including empty-vs-populated `repetir` timeline shaping.
- [x] GREEN: `anime-detail.helpers.ts` with JSDoc on every exported helper.
- [x] RED: `__tests__/AnimeDetail.test.tsx` — dumb render assertion only (HeroUI + Tailwind, no
      Wails calls, no `useEffect` in the `.tsx`).
- [x] GREEN: `AnimeDetail.tsx` consuming `use-anime-detail`'s view model, all `*Props` fields
      `readonly`.

### Phase 2.4 — Route + drill-down from Catalog (spec: Anime Detail / "Shared Detail Component")
- [x] RED: routing test asserting `/catalog/detail/:id` resolves to the shared detail (static
      `detail/` prefix per design Decision 1 — prevents `:id` shadowing the future `/catalog/history`
      segment).
- [x] GREEN: `frontend/src/app/routes/AnimeDetailRoute.tsx` (thin composition — `useParams` for
      `:id`, renders `<AnimeDetail animeId={id} />`; permitted under `app/**` "delivery/composition
      only" since `useParams` is routing composition, not state/effect or a Wails call) + nested
      `<Route path="/catalog/detail/:id" element={<AnimeDetailRoute />} />` in `App.tsx`.
- [x] GREEN: `CatalogPanel`/`CatalogFilterBar` (or their row-item component) navigates to
      `/catalog/detail/:id` via `Link`/`useNavigate` for a selected anime.

### Phase 2.5 — Verify slice 2
- [x] `bun --cwd=frontend run test` GREEN (renamed Catalog suites + new anime-detail suites).
- [x] Catalog renders renamed with unchanged filter/search behavior; detail reachable from Catalog.
- [x] `bun --cwd=frontend run filesize:warning` advisory pass; ESLint hard-fail-500 clean.
- [x] `tsc` clean.
- [x] **Orchestrator committed slice 2** as `ad12128` on `feat/catalog-history` — green even before History
      exists (detail works from Catalog alone, per design Decision 6).

## Slice 3 — History lens (~300 lines)

### Phase 3.1 — Decision: History content model + timeline ordering (spec: Anime History / "History Read Model")
- [x] Resolve design's open assumption before writing the list hook: History includes every anime
      that HAS at least one `repetir` entry OR has in-progress watch state (`nrocapvisto` > 0 and
      `nrocapvisto` < `totalcap`) — i.e. "has progress or repetition history," not "all animes."
      Timeline ordering within a card: most-recent `fechaRepeticion` first (desc), matching design's
      assumed default. Record this decision inline as a code comment in the helpers file (not a
      separate doc) since it is a behavior-defining choice, not self-evident from the code.
- [x] RED: `frontend/src/features/history/ui/HistoryList/__tests__/history-list.helpers.test.ts`
      (or hook-level test) encoding the above filter + ordering rule against sample `AnimeDetail`-
      shaped fixtures (empty repetir, single-entry, multi-entry, no-progress-no-repetir excluded).

### Phase 3.2 — `features/history/` list (spec: Anime History / "History Read Model", "Read-only")
- [x] Scaffold via `bun --cwd=frontend run generate:feature history HistoryList`.
- [x] GREEN: `use-history-list.ts` — owns fetch (reuse `getAnimes`/existing catalog source plus
      per-item `repetir` from list data — confirm whether the slim `getAnimes` payload already
      carries progress fields `nrocapvisto`/`totalcap`; if `repetir` is NOT on the slim list DTO
      per design Decision 4, the History list must fetch progress/repetition summary through a
      route that includes it — document and resolve this data-source gap explicitly as part of
      this task, not silently assume availability). RESOLVED: `getAnimes()` already carries
      `nrocapvisto`/`totalcap` (progress); `repetir` is genuinely absent from the slim DTO. Two-step
      fetch implemented in `loadHistoryEntries` (`history-list.helpers.ts`): cheap prefilter over
      `getAnimes()` by nonzero progress (`isHistoryDetailCandidate`), then per-candidate
      `getAnimeDetail(id)` to obtain `repetir` and apply the full membership rule. No new Go
      endpoint added. Documented known limitation: an anime with CURRENT `nrocapvisto === 0` but
      prior `repetir` history from an earlier cycle is not detected (would require either a bulk
      repetition field on the slim DTO — rejected by design Decision 4 — or fetching detail for the
      entire catalog, which does not scale).
- [x] GREEN: `history-list.helpers.ts` (JSDoc'd) implementing the Phase 3.1 filter/ordering
      decision.
- [x] RED + GREEN: `HistoryList.tsx` (or per-item `HistoryCard`) dumb render of progress (watched/
      total) and repetition count per entry, English UI chrome (spec: "History labels render in
      English"), preserving Spanish data literals verbatim where they originate from Legacy data
      (spec: "Data literals stay Spanish").
- [x] Test: no write/patch/reconcile call is triggered by any History interaction (spec: "History
      surface is read-only") — assert the hook exposes no mutation callable, only navigation to
      detail.

### Phase 3.3 — Segmented Catalog/History control + routes (spec: Anime History / "Reached Without an 8th Bottom-Nav Tab")
- [x] RED: routing/component test — segmented control renders on `/catalog` and `/catalog/history`
      only (not on `/catalog/detail/:id`), switching lens without altering the nav.
- [x] GREEN: segmented control component (colocated under `features/catalog/` as the host lens
      switcher, per design Decision 2 — it lives with neither lens's data, only the switch UI) +
      `<Route path="/catalog/history" element={<HistoryRoute />} />` in `App.tsx`.
- [x] GREEN: `HistoryRoute` (thin composition in `app/routes/`) rendering `<HistoryList />`, drill-
      down to `/catalog/detail/:id` via the SAME shared `AnimeDetail` from slice 2.
- [x] Test: bottom nav entry count is still exactly 7 after this slice (spec scenario, direct
      assertion against `NAV_ITEMS.length`).

### Phase 3.4 — Verify slice 3
- [x] `bun --cwd=frontend run test` GREEN — History lists real progress/repetition data, segmented
      control switches lenses, detail reachable from History, nav still 7 entries.
- [x] `bun --cwd=frontend run filesize:warning` advisory pass; ESLint hard-fail-500 clean.
- [x] `tsc` clean.
- [x] **Orchestrator committed slice 3** as `aba9cf1` on `feat/catalog-history` — final slice, only adds a lens +
      route over the slice-2 hub (design Decision 6).

## Phase 4 — Close (orchestrator, after slice 3)
- [x] `go test ./...` GREEN, `bun --cwd=frontend run test` GREEN (61 files / 463 tests), full
      pre-commit gate green on every slice commit (gofmt, golangci-lint, `go vet`,
      `go run ./tools/checkgofilesize`, ESLint, `tsc`, `bun run filesize:warning`, sdd-gate,
      openapi).
- [x] Confirmed all three commits landed on `feat/catalog-history` in order:
      slice 1 `4237339` → slice 2 `ad12128` → slice 3 `aba9cf1`, each independently green per its
      own Phase N.x Verify step (12/12 gates on each commit).
- [ ] Archive DEFERRED (matches repo practice for sdd-33/sdd-34): stays under `openspec/changes/`
      until a later archive pass, typically post-merge. Delta specs at
      `specs/anime-detail/spec.md`, `specs/anime-history/spec.md`, `specs/anime/spec.md` to be
      merged into `openspec/specs/` at archive time.

## Review Workload Forecast

| Slice | Est. changed lines | Files (approx) | 400-line budget risk |
|---|---|---|---|
| 1 — Backend data/DTO/binding | ~250 | `anime_raw_fields.go` (+field, small additive), `anime_raw.go` (+2 lines wiring), `anime_raw_projection.go` (+projection fn), `contracts.go` (+struct), `mobile.go` (+1 line), `app_runtime.go` (+binding), `bridge-runtime-source.ts` (+method), `anime.types.ts` (+2 interfaces), new/extended `_test.go`/`.test.ts` files | Low — largest existing file touched is `anime_raw_fields.go`, well under 400 with one additive field type |
| 2 — Catalog rename + Detail scaffold | ~150 | Rename touches `features/anime/` → `features/catalog/` (git-tracked move, low net-new lines), `AppLayout.tsx` (1-line label/route change), `App.tsx` (route swap), new `features/anime-detail/` scaffold (6 small colocated files via generator) | Low — rename is mechanical; generated scaffold files start small by construction |
| 3 — History lens | ~300 | New `features/history/` (6 colocated files via generator), segmented control component, `HistoryRoute`, `App.tsx` route addition | Low-Medium — the list hook + helpers carry the filter/ordering decision logic; watch `history-list.helpers.ts` if the data-source gap (Phase 3.2) requires extra normalization code |
| **Total** | **~700** | ~20-25 touched/added files across 3 commits | **Low overall** — already resolved as 3 chained work-unit commits (delivery strategy pre-resolved by orchestrator); no single commit approaches the 400-line warn threshold per file, and no `size:exception` is anticipated |

**Chained-commits plan:** confirmed — 3 sequential commits on `feat/catalog-history`
(slice 1 → 2 → 3), each gated by its own Phase N.x Verify step before the orchestrator commits.
**Decision needed before apply:** No — delivery strategy and slice boundaries are fully resolved
in this document; `sdd-apply` proceeds directly to Phase 1.0.
