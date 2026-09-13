# Tasks: History UI Redesign (SDD-72)

Change: `2026-09-13-sdd-72-history-ui-redesign`
Inputs: `proposal.md`, `design.md` (D1–D10, D10 is the unit backbone), `specs/anime-history/spec.md`, `specs/watch-history/spec.md` (delta), `specs/anime-detail-watch-history/spec.md` (new). Worktree: `autoreas-bridge-worktrees/sdd-69-real-history`.

## Task-Planning Notes (read before Unit 1)

- `tools/checkarchitecture` is a raw substring scan over `.go`/`.ts`/`.tsx` source text, comments included — never spell `watch_history` outside `internal/watchhistory/`; run it by hand on frontend units (its commit job is globbed to Go files).
- `.dharness/fallow.jsonc` forbids `features/history` importing `features/anime-detail` — this is why U3 moves the cover hook to `shared/anime-cover/` before U10 consumes it.
- ADR-012's live branch is mandatory on both new long lists (History rows, Anime Detail episodes): `isNearListBottom` + the server page as the batch. Never `useProgressiveListWindow`, `Table.LoadMore`, `useLoadMoreSentinel`, or `Virtualizer`.
- Loading/empty/error stay exclusive per surface (list, inspector, each tab, each Accordion item); every loading test asserts the negative (no real content while loading), per CLAUDE.md FE #14.
- JSDoc is mandatory on every declaration this change touches — production and test, private and public.
- Never hand-edit `frontend/package.json`; U6 adds `@internationalized/date` only via `bun add`.
- `/history` is not in render-smoke's `ROUTE_MARKERS` today; U7 decides and adds it, since this redesign gives the route real content worth a smoke assertion (CLAUDE.md #18b).
- `git diff --stat -- docs/openapi.yaml` MUST stay empty across every unit — no REST/WS surface changes.
- MUTATE is never an apply-agent step in this change (the frontend staged-mutation job measures nothing in linked worktrees): the orchestrator runs `ditto changed` (Go) / hand-run Stryker (frontend), always post-commit, and apply agents never run background/detached commands — every verification command runs to completion in the foreground.
- U3's rename cost is unmeasured until staged: run `git diff -M --stat` before deciding whether the `normalizeAnimeDetailPortadaUrl` move lands in U3 or defers to U10 (design D10's fallback split).
- U11 must land before U10: U10's recent-episode rows reuse `formatRowDateTime`, which U11 introduces.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈5,460–6,590 across 15 units (design D10, `wc -l` comparables) |
| 600-line budget risk | Low overall; tight for U1, U3 (unmeasured), U11, U14 (~90–95% of cap) |
| Chained PRs recommended | Yes |
| Suggested split | Fifteen chained commits (U1 → U15) on `feat/sdd-69-real-history`, each independently shippable |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main — sequential commits merging in order (CLAUDE.md #19b) |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
600-line budget risk: Low
```

### Suggested Work Units

| Unit | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|
| U1 | `go test ./internal/watchhistory/...` | N/A (no shell/process surface) | `git revert`; unwired query surface |
| U2 | `go test ./internal/desktop/... ./internal/api/...` + `bun --cwd="frontend" run test -- bridge-runtime-source` | N/A | `git revert`; contracts+wailsjs+adapter+call sites land together |
| U3 | `bun --cwd="frontend" run test -- anime-cover anime-detail` | N/A | `git revert`; a rename, or a rename + one small helper move |
| U4 | `bun --cwd="frontend" run test -- history-params use-history-params HistoryFilterBar use-history-timeline` | N/A | `git revert`; Sort-only bar, unconsumed by the still-old list |
| U5 | `bun --cwd="frontend" run test -- history-timeline HistoryFilterBar` | N/A | `git revert`; adds Search/Status/Type on top of U4 |
| U6 | `bun --cwd="frontend" run test -- history-params HistoryFilterBar` | `bun run render:smoke` | `git revert`; drops the only new dependency |
| U7 | `bun --cwd="frontend" run test -- HistoryTimeline` | `bun run render:smoke` | `git revert`; sectioned rows replace the old row shape |
| U8 | `bun --cwd="frontend" run test -- HistoryTimeline history-route` | `bun run render:smoke` | `git revert`; selection + URL restore |
| U9 | `bun --cwd="frontend" run test -- HistoryInspector` | `bun run render:smoke` | `git revert`; additive inspector core |
| U11 | `bun --cwd="frontend" run test -- watch-history use-anime-watch-episodes AnimeWatchEpisodeList` | `bun run render:smoke` | `git revert`; moved hook + new flat list |
| U12 | `bun --cwd="frontend" run test -- anime-watch-history anime-detail` | N/A | `git revert`; view-model helpers only |
| U13 | `bun --cwd="frontend" run test -- AnimeWatchHistory use-anime-watch-accordion` | `bun run render:smoke` | `git revert`; Tabs + Accordion wiring |
| U14 | `bun --cwd="frontend" run test -- AnimeDetail AnimeWatchHistory AnimeWatchSummary` | `bun run render:smoke` | `git revert`; the only unit deleting `AnimeRepetitionTimeline` |
| U10 | `bun --cwd="frontend" run test -- HistoryInspector anime-cover` | `bun run render:smoke` | `git revert`; cover + 3 recent episodes |
| U15 | — (docs only) | N/A | `git revert`; documentation only |

`auto-chain` resolves `Decision needed before apply` to `No` — `sdd-apply` proceeds directly with Unit 1.

---

## Unit 1 — Go `PageQuery`: order, filters, mirrored keyset

**Leaves the app working because:** an unwired query surface; nothing calls it with the new fields yet.
**Forecast:** 380–450 (D10).

- [x] **1.1** [RED] `internal/watchhistory/store_page_query_test.go`: table `{order, limit, want pages}` proving both orders page every row exactly once across a page boundary of equal `watched_at_ms`.
- [x] **1.2** [RED] Same file: one table per predicate, both orders as rows — search (case fold, `%`/`_` literal, the `CAFÉ` non-match row), watched range (`from` inclusive, `to` exclusive boundary rows), `AnimeIDs` (empty = unfiltered vs. a set), `Cycle` (`0` = every cycle vs. `>0`), and all three combined.
- [x] **1.3** [RED] Same file: an unknown `Order` returns a builder error (table row). Plan tests via `EXPLAIN QUERY PLAN` (mirroring `TestAnimePageQueryPlanSeeksTheAnimeIndex`): no `USE TEMP B-TREE FOR ORDER BY` on an unfiltered page in either order; a cycle-scoped `AnimePage` `SEARCH`es an anime-leading index with no `SCAN watch_history`. If the planner does not seek the row-value range on the `DESC` index, record the measured plan and keep only the no-temp-B-tree assertion (D1 — non-blocking).
- [x] **1.4** [GREEN] `internal/watchhistory/store_page.go`: extend `PageQuery{Order, Search, AnimeIDs, FromMS, ToMS, Cycle}`; the mirrored row-value comparator per order; the predicate builder (search trimmed + escaped as `center.escapeLikePattern` does, `anime_id IN (SELECT value FROM json_each(?))` for `AnimeIDs`, `cycle > 0`, the half-open watched range).
- [x] **1.5** [GREEN] `internal/watchhistory/store_page_test.go`: mechanical update for the new `buildPageQuery` signature, extracted into a shared `explainPageQueryPlan` helper. Orchestrator-adjusted: `TestAnimePageQueryPlanSeeksTheAnimeIndex` (plain per-anime page) keeps its original strict assertion (`idx_watch_history_anime`, never `SCAN`) unchanged; only the new cycle-scoped plan test in `store_page_query_test.go` accepts either anime-leading index.
- [ ] **1.6** [MUTATE] orchestrator, post-commit: `ditto changed` (Go, `-timeout 60s`) on `internal/watchhistory/`'s production lines; confirm the design table's mutants die (`<`/`<=`, `>`/`>=`, the `ASC`/`DESC` comparator pairing, the escape guard, `len(AnimeIDs) > 0`, `Cycle > 0`).
- [ ] **1.7** [REFACTOR] Kill any survivor with a new table row (lean-tests — never a new test function).
- [x] **1.8** [VERIFY] `go build ./...`; `go vet ./internal/watchhistory/...`; `GOFLAGS=-p=4 GOMAXPROCS=4 go test -timeout 180s ./internal/watchhistory/...`; `scripts/lint.ps1 -Profile all`; `go run ./tools/checkgofilesize`.

---

## Unit 2 — Binding contract: request structs replace cursor-only signatures

**Leaves the app working because:** contracts, bindings, wailsjs, the adapter and both call sites land together — no commit calls a signature the backend lacks (D3).
**Forecast:** 340–420 (D10).

- [x] **2.1** [RED] Extend `internal/api/contracts/contracts_english_test.go`: `WatchHistoryPageRequest` and `AnimeWatchHistoryPageRequest` carry English JSON tags (`search`, `animeIds`, `watchedFromMs`, `watchedToMs`, `order`, `cursor`, `limit` / `animeId`, `cycle`, `cursor`, `limit`).
- [x] **2.2** [GREEN] `internal/api/contracts/contracts.go`: add both request structs (D3).
- [x] **2.3** [RED] `internal/desktop/app_runtime_watch_history_test.go` (new): table for `toWatchHistoryPageQuery`/`toAnimeWatchHistoryPageQuery` — `"" → newest`, `"oldest" → oldest`, unknown → `Status: "error"`; every field copied; the nil-service guard and store-error surfacing stay unchanged (SDD-69's nil-guard contract).
- [x] **2.4** [GREEN] `internal/desktop/app_runtime.go`: `GetWatchHistoryPage(request contracts.WatchHistoryPageRequest)` / `GetAnimeWatchHistoryPage(request contracts.AnimeWatchHistoryPageRequest)`. Orchestrator-adjusted: the pure mapping functions moved to new `app_watch_history_page.go` — `app_runtime.go` alone crossed revive's 400-line file-length-limit.
- [x] **2.5** [GREEN] `wails generate module` — regenerate `frontend/wailsjs/go/desktop/App.{d.ts,js}` and `frontend/wailsjs/go/models.ts`.
- [x] **2.6** [RED] `frontend/src/infrastructure/__tests__/bridge-runtime-source-queries.test.ts` and `-degraded.test.ts`: the adapter passes an object literal for both calls, copying arrays (as `notification-center-source.helpers.ts:43` does); the degraded test covers a missing binding.
- [x] **2.7** [GREEN] `frontend/src/shared/contracts/anime.types.ts` (both request types, `readonly`); `bridge-runtime-source.{types,helpers}.ts`: request-shaped signatures; update the two existing call sites (`getWatchHistoryPage?.(cursor)`, `getAnimeWatchHistoryPage?.(animeId, '')`) to the request shape in this same commit.
- [ ] **2.8** [MUTATE] orchestrator, post-commit: `ditto changed` (Go, `-timeout 60s`) on `internal/desktop/`'s production lines / Stryker by hand (frontend) on the adapter's changed lines.
- [ ] **2.9** [REFACTOR] lean-tests: table rows, one helper per package.
- [x] **2.10** [VERIFY] Go: `go build ./...`; `go vet`; `GOFLAGS=-p=4 GOMAXPROCS=4 go test -timeout 180s ./internal/desktop/... ./internal/api/...`; `scripts/lint.ps1 -Profile all`; `go run ./tools/checkarchitecture`; `go run ./tools/checkgofilesize`. Frontend: `bun --cwd="frontend" run test -- bridge-runtime-source`; `bun run typecheck`; eslint on touched files; `git diff --stat -- docs/openapi.yaml` empty.

---

## Unit 3 — Move the cover hook (+ maybe normalization) to `shared/anime-cover/`

**Leaves the app working because:** a `git mv` behind an unchanged import at the one call site.
**Forecast:** ~150 as a rename; 620–640 if git scores it as delete+add, in which case task 3.3 defers to U10 (D10).

- [x] **3.1** [GREEN] `git mv frontend/src/features/anime-detail/ui/AnimeDetail/use-anime-detail-cover.ts frontend/src/shared/anime-cover/use-anime-cover.ts` (+ its test); rename `useAnimeDetailCover` → `useAnimeCover`, `AnimeDetailCoverEntry` → `AnimeCoverEntry`; update `AnimeDetail`'s import.
- [x] **3.2** [MEASURE] Run `git diff -M --stat` on the staged move. If git recognizes it as a rename (≈150 changed lines), continue to 3.3 in this unit. If it scores as delete+add (≈620–640), stop here, commit the hook move alone, and defer 3.3 to U10 (task 10.1). Measured: git scored it a rename at 58 changed lines (hook move alone); 125 changed lines total after 3.3.
- [x] **3.3** [GREEN] (only if 3.2 measured a low-cost rename) Move `normalizeAnimeDetailPortadaUrl` beside the hook as `normalizeStoredCoverPath` in `anime-cover.helpers.ts`; update its one caller.
- [ ] **3.4** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines (expect no new mutants for a pure move; confirm rather than assume).
- [x] **3.5** [VERIFY] `bun --cwd="frontend" run test -- anime-cover anime-detail`; `bun run typecheck`; eslint on touched files; `go run ./tools/checkarchitecture` (it scans `.ts`/`.tsx` too).

---

## Unit 4 — URL params + `useHistoryParams` + Sort control + request key

**Leaves the app working because:** a new, feature-local params module and a Sort-only filter bar not yet wired into the still-rendering `HistoryTimeline`.
**Forecast:** 450–540 (D10).

- [x] **4.1** [RED] `history-params.helpers.test.ts`: `parseHistoryParams`/`serializeHistoryParams` round-trip; defaults omitted (`status`, `type`, `sort=newest`, no range, no `anime`/`row`); an unparseable value is absent, never an error; `sort=oldest` present only when set (D5).
- [x] **4.2** [GREEN] `history-params.helpers.ts`, `history-filter-bar.types.ts` (readonly), `history-filter-bar.constants.ts`.
- [x] **4.3** [RED] `use-history-params.test.tsx` (`renderHook` + `MemoryRouter`): push vs. replace per param (`status`/`type`/`range`/`sort` push; `q` debounced replace; `anime`/`row` replace); the functional `setSearchParams(prev => …)` writer never lets a pending debounced search clobber a pushed filter.
- [x] **4.4** [GREEN] `useHistoryParams`, a thin adapter over `useSearchParams`.
- [x] **4.5** [RED] `HistoryFilterBar.test.tsx`: dumb-component render — a Sort `Select` (Newest/Oldest) calling `onSortChange`; no Wails call, no `useEffect`.
- [x] **4.6** [GREEN] `HistoryFilterBar.tsx` (Sort only this unit — Search/Status/Type land in U5, the range in U6).
- [x] **4.7** [RED] `use-history-timeline.test.ts`: `requestKey` is the JSON of the request without its cursor; a changed key increments a generation ref, clears rows, sets `isLoading`; a response from a stale generation is dropped.
- [x] **4.8** [GREEN] `use-history-timeline.ts`: request key + generation guard, wired to Sort/order only.
- [ ] **4.9** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [x] **4.10** [REFACTOR] lean-tests: `it.each` tables applied throughout; no dates needed this unit.
- [x] **4.11** [VERIFY] `bun --cwd="frontend" run test -- history-params use-history-params HistoryFilterBar use-history-timeline`; `bun run typecheck`; eslint on touched files; `go run ./tools/checkarchitecture`.

---

## Unit 5 — Search, Status/Type, `resolveHistoryAnimeScope`

**Leaves the app working because:** additive filters on the same unwired-to-final-list surface as U4.
**Forecast:** 420–520 (D10).

- [x] **5.1** [RED] `history-timeline.helpers.test.ts` (new file): `resolveHistoryAnimeScope(catalog, status, type)` table — `all` / `ids` / `none` (D2).
- [x] **5.2** [GREEN] `resolveHistoryAnimeScope` in `history-timeline.helpers.ts`.
- [x] **5.3** [RED] `use-history-timeline.test.ts` (extend): loads `getAnimes()` once per visit, indexed by ID; `none` makes **zero** binding calls and renders the filtered-empty state; `ids` passes the ID set; `all` passes none.
- [x] **5.4** [GREEN] `use-history-timeline.ts`: catalog load + scope resolution wired before the request.
- [x] **5.5** [RED] `HistoryFilterBar.test.tsx` (extend): a debounced (300ms) `SearchField` writes `q` via replace; Status/Type `Select`s (four values incl. All) write via push. Orchestrator-adjusted: the debounce/replace behavior is pinned by a new colocated `use-history-filter-bar.test.ts` instead (CLAUDE.md FE #1 — `HistoryFilterBar.tsx` stays dumb); this file pins the dumb Search/Status/Type rendering and immediate onChange forwarding.
- [x] **5.6** [GREEN] `HistoryFilterBar.tsx`: add Search/Status/Type; `useDebounce(300)` local draft; a render-phase reset against the previously seen `q` on an external change — never an effect (D5 stale-param lesson, autoreas-theme 1.0.11). Orchestrator-adjusted: the draft/debounce/render-phase-reset logic lives in a new colocated `use-history-filter-bar.ts` (`useHistoryFilterBarSearch`), not inside the `.tsx`.
- [ ] **5.7** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines; confirm the `none`-short-circuit mutant (design table) dies via the zero-binding-calls test.
- [x] **5.8** [REFACTOR] lean-tests.
- [x] **5.9** [VERIFY] `bun --cwd="frontend" run test -- history-timeline HistoryFilterBar`; `bun run typecheck`; eslint on touched files; `go run ./tools/checkarchitecture`.

---

## Unit 6 — Watched range: `DateRangePicker`, `toLocalDayRangeMs`

**Leaves the app working because:** an additive filter control and one new direct dependency.
**Forecast:** 170–240 (D10).

- [x] **6.1** [RED] `history-params.helpers.test.ts` (extend): `toLocalDayRangeMs('2026-09-01', '2026-09-13')` returns `[new Date(2026, 8, 1).getTime(), new Date(2026, 8, 14).getTime())` — half-open, built with `new Date(y, m, d)` (D4).
- [x] **6.2** [GREEN] `toLocalDayRangeMs` in `history-params.helpers.ts`.
- [x] **6.3** [GREEN] `bun add @internationalized/date@^3.12.2` — never edit `package.json` by hand; verify with `bun pm ls` that only one copy resolves.
- [x] **6.4** [RED] `HistoryFilterBar.test.tsx` (extend): the `DateRangePicker` writes `from`/`to` as one push; an invalid or `from > to` range is ignored (absent from the URL). Orchestrator-adjusted: exercised through a small `ControlledRangeHarness` (feeds `onRangeChange` back into the controlled `range` prop, mirroring a real caller) instead of a static prop, since a fully-controlled `DateRangePicker` re-derives each segment edit from the last committed `value` — a static prop can't observe a second, divergent edit.
- [x] **6.5** [GREEN] Wire `DateRangePicker` (Root/Trigger/Popover + `DateField`/`RangeCalendar`); `parseDate(from)` in, `CalendarDate.toString()` out.
- [ ] **6.6** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines; confirm the `>= from` / `< to` boundary mutants (design table) die via exact-boundary row tests.
- [x] **6.7** [REFACTOR] lean-tests.
- [x] **6.8** [VERIFY] `bun --cwd="frontend" run test -- history-params HistoryFilterBar`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`.

---

## Unit 7 — Sectioned `ListBox` rows, chips, `getHistoryStatusColor`

**Leaves the app working because:** the list's own rendering changes; still unwired to selection/URL.
**Forecast:** 320–420 (D10).

- [x] **7.1** [RED] `HistoryTimeline.test.tsx` (rewrite): one `ListBox.Section` per `groupEntriesByDay` group, `Header` = `formatDayHeading` + count (partial for the trailing group); each `Item`: name truncates before its chips, status chip first, a Rewatch chip only when `cycle > 1`, "Episode N" + `formatRowTime`.
- [x] **7.2** [GREEN] `HistoryTimeline.tsx`: sectioned `ListBox` (`selectionMode="single"`, `disallowEmptySelection`); `getHistoryStatusColor` in `history-timeline.helpers.ts` (feature-local, distinct from `anime-estado.constants.ts` — 2 occurrences, under fallow's 3-occurrence duplicate floor).
- [x] **7.3** [RED] `HistoryTimeline.windowing.test.tsx` (rewrite): `role="option"` count = 50 after the first load, 100 after one near-bottom scroll.
- [x] **7.4** [GREEN] Confirm `onScroll` + `isNearListBottom` stay wired on the wrapping `overflow-y-auto` div (ADR-012 live branch, unchanged from SDD-69).
- [x] **7.5** [DECISION] Add `/history` to render-smoke's `ROUTE_MARKERS` (CLAUDE.md #18b) — this redesign gives the route real content worth a smoke assertion.
- [ ] **7.6** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [x] **7.7** [REFACTOR] lean-tests; every loading test asserts the negative.
- [x] **7.8** [VERIFY] `bun --cwd="frontend" run test -- HistoryTimeline`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`; `go run ./tools/checkarchitecture`.
- [x] **7.9** [RED/GREEN] `use-history-timeline.test.ts`: a rejected catalog load surfaces an error and makes zero watch-history binding calls; it never degrades to a legitimate empty history.

---

## Unit 8 — Selection: replace mode, `anime`/`row`, `onAction` navigate

**Leaves the app working because:** completes the History surface's own contract before the inspector consumes the selection.
**Forecast:** 260–340 (D10).

- [x] **8.1** [DELETE] (landed with U7: the ListBox rows broke it) `frontend/src/app/routes/__tests__/history-route-query-state.test.tsx` — pins the REMOVED "no persisted query state" requirement (proposal REMOVED table).
- [x] **8.2** [RED] `history-timeline.helpers.test.ts` (extend): selected-key resolution table — the `row` param when loaded and belonging to `anime`; else the first loaded row of `anime`; else nothing highlighted (D5).
- [x] **8.3** [GREEN] The selected-key helper in `history-timeline.helpers.ts`.
- [x] **8.4** [RED] `HistoryTimeline.test.tsx` (extend): `selectionBehavior="replace"`; a single click selects without navigating; Enter and double-click each call `navigate('/catalog/detail/' + animeId)`; arrow keys move focus and selection together (D7).
- [x] **8.5** [GREEN] `use-history-selection.ts` (new): `onSelectionChange → setSelection(anime, row)` via `useHistoryParams` replace; `onAction → navigate`.
- [x] **8.6** [RED] `frontend/src/app/routes/__tests__/history-route-url-state.test.tsx` (new, `MemoryRouter` with two entries): Back from `/catalog/detail/:id` restores `status`/`anime`/`row`; scroll position is not restored (the route remounts).
- [x] **8.7** [GREEN] Wire the selection through the route; confirm `useAnimeDetail.onBack`'s existing `navigate(-1)` round-trips the URL unchanged — no Anime Detail code changes here (D5).
- [ ] **8.8** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [x] **8.9** [REFACTOR] lean-tests.
- [x] **8.10** [VERIFY] `bun --cwd="frontend" run test -- HistoryTimeline history-route`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`.
- [x] **8.11** [ORCHESTRATOR] Mount HistoryFilterBar + wire search/range/status/type/order into the page request; filtered-empty copy; split layout deferred to U9 with the inspector.

---

## Unit 9 — Inspector core: hook, states, helpers, tsx

**Leaves the app working because:** additive — a new panel, no writers into it yet from a stale build (the route already lands the selection from U8).
**Forecast:** 430–530 (D10).

- [ ] **9.1** [RED] `use-history-inspector.test.ts`: given an `animeId`, fetches `getAnimeDetail`; the snapshot is keyed by `animeId` with an `active` flag per effect — a stale `animeId`'s response is ignored; states table: no `animeId` → prompt; snapshot keyed to another `animeId` → skeleton; `null` detail → error; otherwise → content (D8).
- [ ] **9.2** [GREEN] `use-history-inspector.ts`: `getAnimeDetail(animeId)` + derived Added (`repetitions[0]?.createdAt ?? createdAt`) and Last watched (newest recent row, fallback `lastWatchedAt`) via `history-inspector.helpers.ts`.
- [ ] **9.3** [RED] `HistoryInspector.test.tsx`: a compact prompt when no `animeId` (not `AirisEmptyState`); a shape-mirroring skeleton (`role="status"`, `aria-labelledby` → `sr-only` span) while keyed to a stale `animeId`; an error `Alert` on `null` detail; content renders the cover placeholder, linked name, status + type chips, "N episodes" (`ProgressBar` only with a total), last watched, added date, and "Open anime detail".
- [ ] **9.4** [GREEN] `HistoryInspector.tsx`, `history-inspector.{helpers,constants,types}.ts`.
- [ ] **9.5** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [ ] **9.6** [REFACTOR] lean-tests; every loading test asserts the negative.
- [ ] **9.7** [VERIFY] `bun --cwd="frontend" run test -- HistoryInspector`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`.

---

## Unit 11 — Anime Detail: `use-anime-watch-episodes`, flat episode list

**Leaves the app working because:** additive alongside the still-present `AnimeRepetitionTimeline`.
**Forecast:** 440–540 (D10).

- [ ] **11.1** [RED] `shared/watch-history/__tests__/watch-history.helpers.test.ts` (extend): `formatRowDateTime` formats "Fri, Sep 11 · 20:03" (date and time together).
- [ ] **11.2** [GREEN] `watch-history.helpers.ts`: `formatRowDateTime`.
- [ ] **11.3** [GREEN] `git mv use-anime-watch-history.ts use-anime-watch-episodes.ts` (+ test); request shape `{animeId, cycle, limit}`; keep the accumulated keyset pages, `isNearListBottom`, and the generation guard.
- [ ] **11.4** [RED] `use-anime-watch-episodes.test.ts` (rewrite): an `enabled` flag gates the fetch (`true` by default for All episodes); the generation guard drops a stale `animeId`'s response.
- [ ] **11.5** [GREEN] Wire the `enabled` flag; `cycle: 0` for the All-episodes case.
- [ ] **11.6** [RED] `AnimeWatchEpisodeList.test.tsx` (new): rows "Episode N" + a "Watch K" chip (visible only when a `cycle` is passed) + `formatRowDateTime`; three exclusive states, loading asserts the negative; no `ANIME_WATCH_HISTORY_TRUNCATED_NOTICE`.
- [ ] **11.7** [GREEN] `AnimeWatchEpisodeList.tsx`: bounded scroll container, `onScroll` + `isNearListBottom` (ADR-012 live branch).
- [ ] **11.8** [RED] `AnimeWatchEpisodeList.windowing.test.tsx` (new, following `HistoryTimeline.windowing.test.tsx`'s shape): the DOM row count starts at the initial batch and grows by one page after a near-bottom scroll.
- [ ] **11.9** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [ ] **11.10** [REFACTOR] lean-tests.
- [ ] **11.11** [VERIFY] `bun --cwd="frontend" run test -- watch-history use-anime-watch-episodes AnimeWatchEpisodeList`; `bun run typecheck`; eslint on touched files; `go run ./tools/checkarchitecture`; `bun run render:smoke`.

---

## Unit 12 — Watch model helpers, `watches` view model

**Leaves the app working because:** pure helpers plus a rename on the existing view model; no visible change without U13's Accordion.
**Forecast:** 400–480 (D10).

- [ ] **12.1** [RED] `AnimeWatchHistory/__tests__/anime-watch-history.helpers.test.ts` (new): `toAnimeWatchViewModels(detail, logStartMs)` table — a shuffled wire order still sorts stable by `numRepetitions` ascending; the current watch is `R + 1`; `spanLabel` (`createdAt` → `deletedAt ?? lastWatchedAt ?? repeatedAt`, current watch ends at `lastWatchedAt`); `episodesLabel` ("X of Y episodes" / "X episodes" without a total) + `progressRatio`; `isPreLog` boundary exactly at `WATCH_HISTORY_LOG_START_MS` (D9).
- [ ] **12.2** [GREEN] `anime-watch-history.helpers.ts`, `anime-watch-history.types.ts` (`AnimeWatchViewModel`, `readonly`).
- [ ] **12.3** [GREEN] `anime-detail.helpers.ts`/`anime-detail.types.ts`: rename `repetitions`/`hasRepetitionHistory` to `watches`. Leave `toAnimeRepeticionViewModel`, `sortAnimeRepeticionesMostRecentFirst`, `formatAnimeDetailRepetitionDate` and their constants in place until U14 (D10: no unit removes information before its replacement renders).
- [ ] **12.4** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines; confirm the pre-log `<`/`<=` boundary mutant (design table) dies via the exact-log-start row.
- [ ] **12.5** [REFACTOR] lean-tests: `it.each` tables; literal expected values (never assert against `WATCH_HISTORY_LOG_START_MS` itself).
- [ ] **12.6** [VERIFY] `bun --cwd="frontend" run test -- anime-watch-history anime-detail`; `bun run typecheck`; eslint on touched files.

---

## Unit 13 — Tabs, Accordion, `use-anime-watch-accordion`

**Leaves the app working because:** replaces the internals of the still-mounted "Watch history" component; `AnimeRepetitionTimeline` stays mounted beside it until U14.
**Forecast:** 360–450 (D10).

- [ ] **13.1** [RED] `use-anime-watch-accordion.test.ts` (new): controlled `expandedKeys`, default = the current watch only; a collapsed item's rows survive re-expansion (only Tabs unmount on switch, D9).
- [ ] **13.2** [GREEN] `use-anime-watch-accordion.ts`.
- [ ] **13.3** [RED] `AnimeWatchHistory.test.tsx` (rewritten into the tabs test): section "Watch history", "N watches" subtitle; Tabs default "By watch"; switching to "All episodes" shows its own loading state on every entry (RAC unmounts panels); "By watch" renders one Accordion item per watch, each item's `enabled = expandedKeys.has(key)` gating its `AnimeWatchEpisodeList`.
- [ ] **13.4** [GREEN] `AnimeWatchHistory.tsx`: Tabs + Accordion wired to `use-anime-watch-accordion` and `toAnimeWatchViewModels`; each item embeds `AnimeWatchEpisodeList` with `cycle` = that watch's number; the All-episodes tab embeds it with `cycle: 0`.
- [ ] **13.5** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [ ] **13.6** [REFACTOR] lean-tests.
- [ ] **13.7** [VERIFY] `bun --cwd="frontend" run test -- AnimeWatchHistory use-anime-watch-accordion`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`.

---

## Unit 14 — `AnimeWatchSummary`, retire `AnimeRepetitionTimeline`

**Leaves the app working because:** the deletion and its replacement's wiring land in the same commit — Anime Detail never has zero or two "history" sections.
**Forecast:** 480–570 (D10).

- [ ] **14.1** [RED] `AnimeWatchSummary.test.tsx` (new): a pre-log watch renders the dashed Started / Premiere / Last watched / Ended summary, no episode row list; Ended reads `deletedAt` (Decision b).
- [ ] **14.2** [GREEN] `AnimeWatchSummary.tsx`.
- [ ] **14.3** [GREEN] `AnimeWatchHistory.tsx`: each item renders `AnimeWatchSummary` when `isPreLog`, else `AnimeWatchEpisodeList`; a post-log past watch with zero rows states its episodes were **not recorded** (SDD-69 D3 empty-state copy, never implying none were watched).
- [ ] **14.4** [DELETE] `AnimeRepetitionTimeline.tsx` + its test; remove `<AnimeRepetitionTimeline .../>` from `AnimeDetail.tsx`.
- [ ] **14.5** [GREEN] `anime-detail.helpers.ts`/`.types.ts`/`.constants.ts`: remove `toAnimeRepeticionViewModel`, `sortAnimeRepeticionesMostRecentFirst`, `formatAnimeDetailRepetitionDate`, `AnimeRepeticionViewModel`, `AnimeRepetitionTimelineProps`, the six `ANIME_DETAIL_REPETITION_*` labels, `ANIME_DETAIL_NO_REPETITIONS_MESSAGE`, `ANIME_WATCH_HISTORY_TRUNCATED_NOTICE`.
- [ ] **14.6** [RED/GREEN] `AnimeDetail.test.tsx`: remove the retired repetition-timeline cases; assert exactly one "Watch history" section renders and no "Repetition history"/"Episode history" section renders (spec scenario).
- [ ] **14.7** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [ ] **14.8** [REFACTOR] lean-tests; confirm zero remaining importers of `AnimeRepetitionTimeline`.
- [ ] **14.9** [VERIFY] `bun --cwd="frontend" run test -- AnimeDetail AnimeWatchHistory AnimeWatchSummary`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`; `go run ./tools/checkarchitecture`; `dharness check` on staged files.

---

## Unit 10 — Inspector cover + 3 recent episodes

**Leaves the app working because:** completes the inspector added in U9; runs last in the History chain because it needs `formatRowDateTime` from U11.
**Forecast:** 200–280, +~70 if U3's task 3.2 deferred the normalization move here (D10).

- [ ] **10.1** [GREEN] (only if U3's 3.2 deferred it) Move `normalizeAnimeDetailPortadaUrl` → `normalizeStoredCoverPath` into `shared/anime-cover/anime-cover.helpers.ts` here instead of U3.
- [ ] **10.2** [RED] `use-history-inspector.test.ts` (extend): `getAnimeCover(animeId)` is called only with a stored cover path (via the shared `useAnimeCover` from U3); `getAnimeWatchHistoryPage({animeId, cycle: 0, cursor: '', limit: 3})` fetches the 3 recent episodes, ignored once the `animeId` is superseded.
- [ ] **10.3** [GREEN] Wire `useAnimeCover` and the 3-row recent-episodes page into `use-history-inspector.ts`.
- [ ] **10.4** [RED] `HistoryInspector.test.tsx` (extend): the cover renders from the shared hook; the 3 recent-episode rows use `formatRowDateTime`.
- [ ] **10.5** [GREEN] Wire the recent-episodes list into `HistoryInspector.tsx`.
- [ ] **10.6** [MUTATE] orchestrator, post-commit: Stryker by hand (frontend) on this unit's production lines.
- [ ] **10.7** [REFACTOR] lean-tests.
- [ ] **10.8** [VERIFY] `bun --cwd="frontend" run test -- HistoryInspector anime-cover`; `bun run typecheck`; eslint on touched files; `bun run render:smoke`.

---

## Unit 15 — Documentation

**Leaves the app working because:** documentation only, zero production code touched.
**Forecast:** ~20–30 (prose only).

- [ ] **15.1** Add a `CHANGELOG.md` `[Unreleased]` entry, in the user's language, Keep a Changelog headings: the redesigned History screen (filters, inspector) and Anime Detail's single Watch history section.
- [ ] **15.2** `node scripts/log-lesson.mjs "<one sentence, <=300 chars>"` — a candidate: the D9 stable-sort-by-`numRepetitions` correction over trusting the stored array order at face value.
- [ ] **15.3** No ADR — design.md's Open Questions do not call for one.
- [ ] **15.4** [VERIFY] `git status --porcelain` shows only `CHANGELOG.md` and `docs/learning-log.md`.
- [ ] **15.5** Orchestrator verifies and commits this final unit.

---

## Requirement → Task Coverage Matrix

| Spec | Requirement | Closed by |
|---|---|---|
| `anime-history` | History Filter Bar (ADDED) | 4.1–4.6, 5.5–5.6, 6.1–6.5 |
| `anime-history` | History State Persists In The URL And Restores On Back (ADDED) | 4.1–4.4, 8.1, 8.6–8.7 |
| `anime-history` | Selecting A Row Fills The Inspector Without Navigating (ADDED) | 8.2–8.7, 9.1–9.4 |
| `anime-history` | Episode Timeline Is Grouped By Day (MODIFIED) | 7.1–7.2 |
| `anime-history` | Loading, Empty, and Error States Are Exclusive (MODIFIED) | 7.7, 9.3, 9.6 |
| `anime-history` | The List Renders Progressively; History Timestamps Read Well; History Is Its Own Top-Level Section; English UI Copy (unchanged) | 7.3–7.4, 11.1–11.2; verified at 7.8 |
| `watch-history` | Read Models Are Keyset-Paged (MODIFIED) | 1.1–1.5, 2.3–2.4 |
| `anime-detail-watch-history` | One Watch History Section Replaces Repetition And Episode Histories | 14.4–14.6 |
| `anime-detail-watch-history` | Watch Number Is Derived From The Stored Cycle | 12.1–12.2 |
| `anime-detail-watch-history` | By Watch Groups Episodes Into One Accordion Item Per Watch | 13.1–13.4 |
| `anime-detail-watch-history` | A Watch Predating The Log Shows Its Repetition Summary | 12.1, 14.1–14.3 |
| `anime-detail-watch-history` | All Episodes Lists Every Recorded Episode With Its Watch | 11.4–11.7 |
| `anime-detail-watch-history` | Long Lists Page Progressively | 11.7–11.8 |
| `anime-detail-watch-history` | Loading, Empty, And Error States Are Exclusive Per Tab | 11.6, 13.3 |
| `anime-detail-watch-history` | Back Navigation From Anime Detail Falls Back To History | 8.7 (unchanged `useAnimeDetail.onBack`, verified) |
| `anime-detail-watch-history` | English UI Copy With Spanish Data Literals Preserved | 12.1, 14.1 |

Every implementation task follows RED → GREEN → REFACTOR; MUTATE runs post-commit, orchestrator-owned. Mandatory JSDoc on every new/modified declaration; every `*Props` property `readonly`; no `index.ts` barrels; strict colocation; strict hook anatomy order. Never assert against a production constant being pinned; write expected values as literals. `docs/openapi.yaml` owes no diff for this change.
