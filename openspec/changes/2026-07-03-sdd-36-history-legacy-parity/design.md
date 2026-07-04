# Design — 2026-07-03-sdd-36-history-legacy-parity

Corrective rework over sdd-35. Backend `repetir`/`GetAnimeDetail` stays; History IA, History read
model, and Detail richness are redone against the Legacy reference (functional floor) with a 2026
UX bar (target). Written by the orchestrator inline (sub-agent quota outage); grounded in
`contracts.go`, `mobile.go`, `anime_raw_projection.go`, and the sdd-35 frontend as committed at
`aba9cf1`.

## Decision 1 — Backend read model: dedicated `AnimeHistoryItem`, server-side sort/membership

New slim DTO in `internal/api/contracts/contracts.go`:

```go
type AnimeHistoryItem struct {
    ID               string  `json:"id"`
    Nombre           string  `json:"nombre"`
    NroCapVisto      float64 `json:"nrocapvisto"`
    FechaUltCapVisto int64   `json:"fechaUltCapVisto"` // epoch millis; always present by membership
    Estado           int     `json:"estado"`
}
```

`ListAnimeHistory(ctx) ([]AnimeHistoryItem, error)` is added to the existing
`contracts.AnimeQueryService` interface (NOT a new port): it is the anime query port and the
method is cohesive with `ListAnimeItems`. Known mechanical cost, accepted: the interface has
compile-time-asserted test stubs at `app_test_helpers_test.go` (`stubAnimeQueryService`),
`internal/api/router_test.go` (`stubAnimeQueryService`), and
`internal/download/service_test_helpers_test.go` (`svcFakeAnimeQuery`) — each gains a one-line
nil-returning method (same precedent as sdd-35 slice 1's five TS mock patches).

Implementation mirrors `ListAnimeItems`'s snapshot projection path in `internal/anime`:
project `LegacyAnimeRaw` → membership filter (`FechaUltCapVisto` present via the existing
`LegacyDateField` accessor — absent/null rows are excluded) → sort `FechaUltCapVisto` DESC in Go.
Soft-deleted handling mirrors whatever `ListAnimeItems` does today (verify during RED; History is
an activity log, so eliminated-but-watched animes stay listed and their estado badge shows it —
matches Legacy, which lists "Eliminar"-state animes).

Rejected alternative: extending `AnimeListItem` with `fechaUltCapVisto` — bloats the
download-gap-focused catalog DTO and forces catalog consumers to carry history concerns.

## Decision 2 — Wails binding `GetAnimeHistory` + client-side pagination/search/filter

`app_runtime.go` gains `GetAnimeHistory() []contracts.AnimeHistoryItem` paralleling `GetAnimes`
(nil-guard on `animeQuery`, empty slice on error). Regenerate wailsjs (`wails generate module`).
`bridge-runtime-source.ts` gains `getAnimeHistory(): Promise<readonly AnimeHistoryEntry[]>` with
the `waitForBindings`/`hasGoBinding` degrade-to-empty pattern.

Pagination, search, and estado filtering happen CLIENT-SIDE over the full server-sorted list:
the dataset is bounded (~800 slim rows, local IPC, desktop app), so shipping the whole sorted
list once and slicing in the hook is simpler and faster than server paging params. Page size 10
(Legacy parity), constant in `history-table.constants.ts`.

## Decision 3 — IA: 8th nav entry, top-level `/history`, lens switch deleted

- `AppLayout.tsx` `NAV_ITEMS`: add `{ to: '/history', label: 'History' }` with an icon consistent
  with the existing rail set (clock/history glyph from the same icon source the other 7 use).
  The sdd-35 "exactly 7 entries" assertions are updated to 8 — that requirement was REMOVED by
  this change's spec (user decision).
- `App.tsx`: `<Route path="/history" element={<HistoryRoute />} />`; the `/catalog/history` route
  is removed. `HistoryRoute.tsx` becomes the top-level History composition (own English title
  "History" + subtitle about watch activity; the "Track progress and repetition history" copy
  moves here, off Catalog).
- `features/catalog/ui/CatalogLensSwitch/` is DELETED (component, hook, helpers, tests).
  `CatalogRoute` renders `CatalogPanel` only; its existing inventory subtitle stays.
- Detail stays at `/catalog/detail/:id` (neutral-enough, already shared; renaming the route buys
  nothing and costs churn). History rows navigate there.

## Decision 4 — History table: rewrite `features/history` as `HistoryTable`

`features/history/ui/HistoryList/` (sdd-35's card list + two-step `getAnimeDetail` fetch) is
REPLACED by `features/history/ui/HistoryTable/` (scaffold via
`bun --cwd=frontend run generate:feature history HistoryTable`, then delete the old folder). The
N+1 per-candidate detail fetch disappears entirely — the new read model carries everything the
table needs in one call.

- `HistoryTable.tsx`: dumb UI, real HeroUI table + pagination primitives (per frontend-theme
  convention — no hand-rolled table divs), skeleton rows while loading, English empty state.
  Columns: # (global row number, continuous across pages), Name, Episodes watched, Last watched
  (long date), Day, Time, Status (semantic HeroUI chip/badge colored by estado — reuse the estado
  label/color mapping conventions from the catalog feature; small formatter duplication is the
  accepted repo pattern).
- `use-history-table.ts` (strict hook anatomy): owns `getAnimeHistory` fetch, debounced search
  term (constant-defined delay), estado filter state, page state; derived state composes
  filter → search → paginate over the server-sorted list.
- `history-table.helpers.ts` (JSDoc'd, TDD-first): `formatHistoryLongDate`,
  `formatHistoryWeekday`, `formatHistoryTime`, `formatHistoryRelativeRecency` (all derived from
  the single `fechaUltCapVisto` millis; English chrome — e.g. "June 30, 2026", "Tuesday",
  "12:12", "2 days ago"), `filterHistoryEntries` (search + estado, composable), `paginate`.
  Timezone note: format in the user's local timezone via `Date`/`Intl` (the Legacy app is
  local-time too); tests pin a fixed timestamp and assert with an explicit timezone-safe
  strategy (UTC-constructed fixtures).

## Decision 5 — Detail enrichment is frontend-only; portada is best-effort

`MobileAnime` already carries everything (`portada` path via `PortadaPath()`, `pagina`,
`carpeta`, `estudios`, `origen`, `generos`, `duracion`, all `fecha*`, `repetir`, `tipo`,
`estado`) — NO backend change in this change for Detail.

Layout (HeroUI, single `AnimeDetail.tsx` kept dumb; helpers build one view model):
1. Hero header: round cover from `portada` with `onError`→placeholder fallback (the legacy value
   is a local file path; if the Wails webview refuses local-path images, the placeholder renders
   and a follow-up asset-handler change is flagged — RECORD the observed behavior in
   apply-progress rather than blocking this change on it), título, "estado • tipo" subtitle from
   human-readable label maps, semantic status chip (e.g. danger-colored for eliminado).
2. Chapter info: stat tiles (watched count, total-or-"No total episodes data",
   duration-or-"No episode duration data") + a lightweight progress bar (HeroUI progress; NO
   chart library dependency) when total is known.
3. General data: página as `<a target="_blank" rel="noreferrer">` (or Wails BrowserOpenURL if
   that is the existing pattern — check `frontend` for prior external-link usage and follow it),
   carpeta, fechas (estreno/creación/últ. cap visto), estudios, origen, géneros — every field
   with an explicit English fallback.
4. Repetition history: keep sdd-35's timeline data, restyled to fit (most recent first).

## Decision 6 — Slices (4 chained work-unit commits, each independently green)

1. **Backend read model** (~200): `AnimeHistoryItem` + `ListAnimeHistory` (+3 stub updates) +
   `GetAnimeHistory` binding + wailsjs regen + TS mirror + fixture tests (assert membership
   count from `animes.dat` and DESC ordering).
2. **IA promotion** (~120): 8th nav entry, top-level `/history` (existing HistoryList moves
   unchanged), delete CatalogLensSwitch, nav-count assertions 7→8, copy moves.
3. **History table** (~350): HistoryTable scaffold, hook, helpers, pagination/search/filter,
   delete HistoryList and its two-step fetch helpers.
4. **Detail enrichment** (~250): hero header, stat tiles + progress, general data links,
   repetir restyle.

Orchestrator verifies and commits after each slice (repo rule); full 12-gate pre-commit is the
verification boundary per slice.

## Risks / open items
- Portada local-path rendering inside the Wails webview is UNVERIFIED — slice 4 handles it
  best-effort with a graceful placeholder and records the observed result.
- Estado label/color mapping must come from the actual value domain used by the catalog feature
  (`catalog-panel.constants.ts`) — verify during slice 3 RED, do not invent states.
- External-link behavior in a Wails webview (plain anchor vs runtime BrowserOpenURL) — follow
  existing repo precedent if any; otherwise anchor with `target="_blank"` and record behavior.
