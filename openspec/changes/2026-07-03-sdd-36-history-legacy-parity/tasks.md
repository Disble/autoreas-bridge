# Tasks — 2026-07-03-sdd-36-history-legacy-parity

Strict TDD: failing test FIRST in each step, then implement to green. sdd-35's backend
(`repetir`, `GetAnimeDetail`) is the regression net and MUST stay green unchanged. Delivery: 4
chained work-unit commits on `feat/catalog-history`; each slice ends independently green against
the FULL pre-commit gate; orchestrator verifies and commits after each slice.

## Slice 1 — Backend history read model (~200 lines)

### Phase 1.0 — Baseline
- [x] `go test ./...` GREEN before any change.

### Phase 1.1 — `AnimeHistoryItem` + `ListAnimeHistory` (spec: Anime History / "History Read Model")
- [x] RED: service-level test (`internal/anime`, alongside the `ListAnimeItems` tests) asserting
      `ListAnimeHistory` returns only animes with a present `fechaUltCapVisto`, sorted DESC by it,
      with id/nombre/nrocapvisto/fechaUltCapVisto(millis)/estado populated; absent/null
      `fechaUltCapVisto` rows excluded; soft-delete handling mirrors `ListAnimeItems`'s existing
      behavior (verify what that behavior IS first; History keeps eliminado animes visible with
      their estado, matching Legacy, unless `ListAnimeItems` precedent dictates otherwise —
      document the verified choice in the test).
- [x] RED: real-fixture test (`resources/autoreas-data/animes.dat`): assert the exact membership
      count of records with present `fechaUltCapVisto` (derive the expected number from the
      fixture in the test setup, don't hardcode blind) and that ordering is non-increasing.
- [x] GREEN: `contracts.go` — add `AnimeHistoryItem` DTO + `ListAnimeHistory` to
      `AnimeQueryService`; `internal/anime` — implement via the same snapshot projection path as
      `ListAnimeItems`.
- [x] GREEN: one-line nil-return stubs in `app_test_helpers_test.go`,
      `internal/api/router_test.go`, `internal/download/service_test_helpers_test.go`.

### Phase 1.2 — `GetAnimeHistory` binding + TS mirror
- [x] RED: `app_runtime_test.go` — populated result for a service with data; empty (non-nil)
      slice when service nil (mirror `GetAnimes` nil-guard tests).
- [x] GREEN: `app_runtime.go` `GetAnimeHistory()` paralleling `GetAnimes`; regenerate wailsjs
      (`wails generate module`).
- [x] RED: `bridge-runtime-source.test.ts` — `getAnimeHistory` resolves mapped entries; degrades
      to `[]` when binding unavailable.
- [x] GREEN: `anime.types.ts` — `AnimeHistoryEntry` (readonly, mirrors DTO);
      `bridge-runtime-source.ts` — `getAnimeHistory` via `waitForBindings`/`hasGoBinding`;
      update the existing test mock factories that widen `BridgeRuntimeSource`.

### Phase 1.3 — Verify slice 1
- [x] `go test ./...`, `gofmt -l .` empty, `golangci-lint run`, `go vet ./...`,
      `bun --cwd=frontend run validate`, `bun --cwd=frontend run test` — ALL GREEN.
- [x] **Orchestrator committed slice 1** as `e7ed072`, full gate green.

## Slice 2 — IA promotion: History as own section (~120 lines)

### Phase 2.1 — Nav + route (spec: Anime History / "History Is Its Own Top-Level Section")
- [x] RED: update `App.test.tsx`/`AppLayout` assertions — nav now has EXACTLY 8 entries including
      a "History" entry to `/history`; `/history` renders the History surface; `/catalog/history`
      no longer exists.
- [x] GREEN: `AppLayout.tsx` NAV_ITEMS + icon (same icon source as the other 7); `App.tsx` route
      swap; `HistoryRoute.tsx` becomes top-level with its own English "History" title/subtitle
      (watch-activity copy moves here from wherever sdd-35 put it).

### Phase 2.2 — Delete `CatalogLensSwitch` (spec: Anime / "Catalog Is Inventory-Only")
- [x] RED: Catalog route test asserting NO lens switch renders on `/catalog`.
- [x] GREEN: delete `features/catalog/ui/CatalogLensSwitch/` entirely (component, hook, helpers,
      constants, tests); remove its usages from routes; existing `HistoryList` keeps rendering at
      `/history` unchanged for this slice.

### Phase 2.3 — Verify slice 2
- [x] `bun --cwd=frontend run test` + `validate` + `filesize:warning` GREEN; `go build ./...`.
- [x] **Orchestrator committed slice 2** as `512d0d0`, full gate green.

## Slice 3 — History table with pagination/search/filters (~350 lines)

### Phase 3.1 — Helpers (TDD-first) (spec: "History Table...", "History Timestamps Read Well")
- [x] Scaffold `bun --cwd=frontend run generate:feature history HistoryTable`.
- [x] RED: `history-table.helpers` tests — long date ("June 30, 2026"), weekday ("Tuesday"),
      time ("12:12"), relative recency ("2 days ago"), all from ONE millis timestamp
      (timezone-safe fixtures); `filterHistoryEntries` (name search + estado filter, composable);
      `paginate` (page slicing + continuous row numbering across pages).
- [x] GREEN: helpers with JSDoc; page size 10 + debounce delay in `history-table.constants.ts`.

### Phase 3.2 — Hook + table (spec: "History Table With Pagination, Search, and Filters")
- [x] RED: `use-history-table` tests — loads via `getAnimeHistory` (single call, NO per-item
      detail fetch), debounced search state, estado filter state, page state, derived visible
      rows, loading flag; exposes NO mutation callable (read-only spec scenario).
- [x] GREEN: `use-history-table.ts` (strict hook anatomy).
- [x] RED: `HistoryTable.tsx` dumb-render tests — HeroUI table with the 7 columns (#, Name,
      Episodes watched, Last watched, Day, Time, Status badge), skeleton state while loading,
      English empty state when zero matches, pagination controls, estado badge semantic color
      (mapping verified against `catalog-panel.constants.ts` value domain — do not invent
      states).
- [x] GREEN: `HistoryTable.tsx` + wire into `HistoryRoute`.

### Phase 3.3 — Remove the old list
- [x] Delete `features/history/ui/HistoryList/` (incl. two-step `loadHistoryEntries` fetch and
      its tests); confirm nothing else imports it.

### Phase 3.4 — Verify slice 3
- [x] `bun --cwd=frontend run test` + `validate` + `filesize:warning` GREEN; `go build ./...`.
- [x] **Orchestrator committed slice 3** as `8da936f` (incl. orchestrator-added numbered
      pagination with ellipsis windowing — the sub-agent's first pass shipped only
      Previous/Next, below the spec's numbered-pagination requirement).

## Slice 4 — Detail "Información" enrichment (~250 lines, frontend-only)

### Phase 4.1 — View model + helpers (spec: Anime Detail delta)
- [x] RED: `anime-detail.helpers` tests — enriched view model: estado/tipo human labels +
      "estado • tipo" line, status-chip variant (e.g. eliminado→danger), watched/total/duration
      stat values with explicit English "no data" fallbacks, progress ratio when total known,
      fecha formatting, géneros/estudios/origen/carpeta fallbacks, página passed through as URL.
- [x] GREEN: helpers (JSDoc'd); verify estado/tipo label domains against catalog constants and
      the fixture — do not invent values.

### Phase 4.2 — Layout (spec scenarios: hero, per-chapter, página link, repetir retained)
- [x] RED: `AnimeDetail.tsx` dumb-render tests — hero (cover img with onError→placeholder,
      título, subtitle, chip), stat tiles, progress bar only when total known, general-data
      section with página as clickable external link (follow existing repo precedent for
      external links if one exists; else anchor target="_blank" rel="noreferrer"), repetir
      timeline still present (most recent first).
- [x] GREEN: `AnimeDetail.tsx` with HeroUI primitives (no chart library). Record in
      apply-progress whether the Wails webview actually renders the legacy local-path portada or
      the placeholder path is taken (known open item — do NOT block on an asset handler).

### Phase 4.3 — Verify slice 4
- [x] `bun --cwd=frontend run test` + `validate` + `filesize:warning` GREEN; `go build ./...`.
- [ ] **Orchestrator commits slice 4.**

## Phase 5 — Close (orchestrator)
- [ ] Full pre-commit gate green on the final commit; 4 commits landed in order.
- [ ] Archive DEFERRED (repo practice, alongside sdd-33/34/35).

## Review Workload Forecast

| Slice | Est. lines | 400-line risk |
|---|---|---|
| 1 — Backend read model + binding + TS mirror | ~200 | Low |
| 2 — IA promotion + lens removal | ~120 (mostly deletions) | Low |
| 3 — History table rewrite | ~350 | Medium — watch `use-history-table.ts` and `HistoryTable.tsx` sizes |
| 4 — Detail enrichment | ~250 | Low-Medium — `AnimeDetail.tsx` may approach warn-400; split subcomponents in the same folder if so |
| **Total** | **~920** | Resolved: 4 chained work-unit commits, orchestrator-verified each |

**Decision needed before apply:** No — delivery strategy pre-resolved (no PR workflow; chained
commits on `feat/catalog-history`).
