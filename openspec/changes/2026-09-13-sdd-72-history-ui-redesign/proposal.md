# Proposal: History UI Redesign (SDD-72)

## Intent

SDD-69 gave `/history` real per-episode data. The owner accepted the data and rejected the UI:

- The timeline removed search and the Status/Type/Sort filters, and lost the scannable columns with them.
- The drill-down into Anime Detail still works (verified) but has no visible affordance.
- Anime Detail shows two histories, "Repetition history" and "Episode history", that read as unrelated
  when they are one structure: anime → watch → episode.

This change rebuilds both surfaces to the owner-approved design (v3, 2026-09-13) on SDD-69's read
model, without changing how history is recorded. Every guard SDD-69 established (exclusive states,
progressive list, English copy) keeps holding.

## Scope

### In Scope

- **History screen**: a filter bar (Search, Status, Type, Watched date range, Sort Newest/Oldest) over a
  split of a day-sectioned list and an inspector.
  - Row: name (truncates first), status chip, Rewatch chip when `cycle > 1`, "Episode N", time.
  - Inspector for the selected row's anime: cover, linked name, status + type chips, watched progress,
    last watched, added date, 3 recent episodes, "Open anime detail".
  - Selecting a row fills the inspector without navigating. Enter on the selected row, the linked name
    and the button open Anime Detail. Scrolling near the end loads the next page.
- **Anime Detail**: one "Watch history" section replaces "Repetition history" and "Episode history".
  - Tab "By watch" (default): one Accordion item per watch, newest first — "Watch N", "Current" chip on
    the live watch, status, span, "X of Y episodes", progress, and rows "Episode N" + "Fri, Sep 11 · 20:03"
    (date and time together, repeated on every row).
  - Tab "All episodes": flat newest-first rows — "Episode N", "Watch K" chip, date · time.
  - A watch that predates the log (before 2026-07-05) shows a dashed summary from its repetition record:
    Started, Premiere, Last watched, Ended.
  - Watch number = stored `cycle`; `repetitions[i]` = watch `i+1`; current watch = `len(repetitions)+1`.
- Read-path plumbing: a filterable, bidirectional global page read; a per-watch per-anime read; Wails
  bindings and the frontend adapter carrying the query.
- Retiring `AnimeRepetitionTimeline` and the 50-row truncation notice.

### Out of Scope

- New History empty-state artwork (Decision e; follow-up change).
- The mobile app.
- REST/WS contract changes. Watch history is reachable only through Wails bindings
  (`internal/desktop/app_runtime.go:197-219`; no REST handler serializes `WatchHistoryPage`), so
  **`docs/openapi.yaml` MUST stay untouched**.
- How watch history is recorded, retracted or backfilled, and the `watch_history` table itself.
- A desktop/phone source column (Decision d).

## Decisions

Owner-level defaults set by the orchestrator. Each is reversible without reworking the rest.

| # | Decision | Consequence |
|---|---|---|
| a | History filters and the selected anime persist in URL search params and are restored on Back from Anime Detail. Scroll position is not restored | **Reverses** `anime-history` "The History Route Carries No Persisted Query State" and `watch-history` "Back Navigation From Detail No Longer Restores List State" |
| b | A repetition's `deletedAt` is labelled "Ended" | Copy only |
| c | No "Watch N" chip in the History inspector | Rows keep the Rewatch chip |
| d | No desktop/phone source column | `source` stays unread by the UI |
| e | Empty states keep `today.webp` until a dedicated History artwork exists | Artwork is a follow-up |

## Capabilities

### New Capabilities

- `anime-detail-watch-history`: the single Watch history section on Anime Detail — tabs, watch grouping
  and numbering, the current watch, the pre-log summary, All episodes, per-tab states and progressive
  loading. **Why a new spec, not a `watch-history` delta**: `watch-history` is the recording and
  read-model contract, and this surface grows from one UI requirement to roughly seven, which would make
  that spec half presentation. `anime-history` already sets the precedent of a UI capability over the
  same read model, and `anime-detail` still has no promoted spec to host it.

### Modified Capabilities

- `anime-history`:

  | Requirement | Fate |
  |---|---|
  | The History Route Carries No Persisted Query State | **REMOVED**; replaced by an ADDED URL-state requirement (Decision a): filters and selected anime in params, omitted at defaults, restored on Back, scroll not restored |
  | The Whole Row Drills Down To Anime Detail | **REMOVED**; replaced by ADDED selection + inspector: selecting fills the inspector without navigating; Enter, linked name and button navigate |
  | Episode Timeline Is Grouped By Day | MODIFIED: day and row order follow Sort (newest by default); row anatomy with status and Rewatch chips |
  | Loading, Empty, and Error States Are Exclusive | MODIFIED: also covers a filtered zero-row result and the inspector |
  | History Filter Bar (new) | ADDED: five controls; filters apply in the read, before paging |
  | The List Renders Progressively; History Timestamps Read Well; History Is Its Own Top-Level Section; English UI Copy with Spanish Data Literals Preserved | Unchanged |

- `watch-history`:

  | Requirement | Fate |
  |---|---|
  | Read Models Are Keyset-Paged | MODIFIED: the global read accepts name search, watched range, an anime-ID set and either order, keyset-paged both ways; the per-anime read can scope to one cycle on the anime index |
  | Per-Anime History Surfaces On Anime Detail | **REMOVED**: moves to `anime-detail-watch-history`; it names the retired `AnimeRepetitionTimeline` (so does the Purpose line) |
  | Back Navigation From Detail No Longer Restores List State | **REMOVED**: superseded by `anime-history`'s URL-state requirement |
  | All recording, retraction, backfill and retention requirements | Unchanged |

No change: `desktop-navigation`, `anime-update-repeat-restore`, `openapi`.

## Approach

- **Go read path** stays inside `internal/watchhistory`: new query fields filter in SQL before paging, and
  ascending order gets its own mirrored keyset comparator, not a flag flip. Status and Type resolve
  outside the package, which holds no status or kind, from `GetAnimes` (`AnimeListItem.Status/Kind`) into
  an anime-ID set. The guard-dense store code takes the MUTATE step with `ditto staged` scoped to
  `./internal/watchhistory/`.
- **History screen** is a new composition (`ListBox` sections + inspector `Card`), not an evolution of the
  Button list; only the `shared/watch-history` helpers carry over. URL state follows the retired 1.12.0
  precedent (`parseHistoryParams`/`serializeHistoryParams`, `useHistoryParamsWriters`, recoverable from
  `5cca549^`; sdd-37 design D2): params omitted at default, debounced search written with `replace`,
  filter changes pushed, and param names in English (ADR-007/008).
- **Anime Detail** builds one section from the repetitions already in `GetAnimeDetail` plus the per-watch
  read. Watch grouping lives in a new colocated helpers file: `anime-detail.helpers.ts` is at 435 of 500.
- Both long lists take ADR-012's **live** branch: `isNearListBottom` with the server page as the batch, no
  `useProgressiveListWindow`, no `Table.LoadMore`, and a DOM-count guard each.

### Design questions (for `sdd-design`, not blockers)

1. One `PageQuery` with a `Cycle` field, or a separate per-cycle method.
2. `DateRangePicker` (needs `bun add @internationalized/date`) or plain date inputs; local-day bounds to
   epoch ms and whether the end bound is inclusive.
3. Per-row status/kind: a frontend join against `GetAnimes`, or an enriched binding DTO.
4. Anime-ID set shape: `IN (...)` over 800+ animes against SQLite's bound-parameter limit.
5. Name search case handling (`LIKE`, no `NOCASE` today) and the explicit unindexed-scan decision.
6. Inspector data source: the list item, or a per-selection `GetAnimeDetail`; recent episodes as a 3-row
   per-anime page.
7. Enter-to-open through React Aria `ListBox` `onAction`, or the keyboard registry (CLAUDE.md #23).
   `onAction` also fires on double-click under single selection (autoreas-theme `1.0.11`).
8. Which Accordion items start expanded.
9. Param names and the push/replace mode per control.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/watchhistory/store_page.go` | Modified | Query fields, mirrored ascending keyset, cycle scope |
| `internal/desktop/app_runtime.go` | Modified | Query-shaped history bindings; status/type → anime IDs |
| `internal/api/contracts/contracts.go` | Modified (conditional) | Only if design picks an enriched row DTO |
| `frontend/wailsjs/go/desktop/App.*` | Regenerated | New binding signatures |
| `frontend/src/infrastructure/bridge-runtime-source/`, `frontend/src/shared/contracts/` | Modified | Adapter and query types |
| `frontend/src/features/history/ui/HistoryTimeline/` | Replaced | Filter bar, day-sectioned list, inspector, URL params hook |
| `frontend/src/shared/watch-history/watch-history.helpers.ts` | Extended | Day grouping reused; date · time row format |
| `frontend/src/app/routes/HistoryRoute.tsx` | Modified (conditional) | Composition only |
| `frontend/src/features/anime-detail/ui/AnimeDetail/` | Modified | One Watch history section; `AnimeRepetitionTimeline` removed; new watch helpers file |
| `frontend/src/features/anime-detail/ui/AnimeWatchHistory/` | Replaced | Tabs, Accordion per watch, All episodes |
| `frontend/package.json` | Modified (conditional) | `@internationalized/date` via `bun add`, only with `DateRangePicker` |
| `docs/openapi.yaml` | **Untouched** | No REST/WS surface |

## Size Forecast

Measured by line count in this worktree (CLAUDE.md #22), not estimated. SDD-69 planned against a
600-line work-unit cap that counts insertions **plus** deletions.

| Code replaced or rewritten | Prod | Test |
|---|---:|---:|
| `HistoryTimeline/` (tsx 106, hook 97, types 19, constants 32) | 254 | 436 |
| `AnimeWatchHistory/` (tsx 93, hook 73) | 166 | 203 |
| `AnimeRepetitionTimeline` | 64 | 83 |
| `AnimeDetail.test.tsx` (419) + `anime-detail.helpers.test.ts` (409), partially rewritten | — | 828 |

Comparables: SDD-69 slices 6a = 644, 6b = 434, 8 = 462 changed lines. Units and bands from explore.md:
(1) Go query plumbing 250–400; (2) bindings, contracts, wailsjs, adapter 200–350; (3) filter bar + URL
state 400–600; (4) day list + inspector 450–600; (5) Anime Detail Watch history 550–750.

Those bands forecast new code; the deletions above are not in them. Retiring `HistoryTimeline` alone is
690 changed lines, so units 4 and 5 cannot absorb their removals under the cap. `sdd-tasks` must place
removals deliberately (SDD-69 slice 7 precedent: a deletion-only unit or a split by file group) and must
split unit 5. An overshoot after that is an over-engineering finding to refactor, not a block.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reversing a requirement promoted one day earlier leaves the two history specs contradicting each other | Med | Deltas REMOVE both conflicting requirements by name and ADD one URL-state requirement |
| Status/Type filter on the anime's *current* status, not its status at watch time; a deleted anime has no status or kind, so a Status/Type filter excludes its rows and "All" shows them chipless | Med | Spec states both outcomes as scenarios |
| Watch numbering assumes repetitions are stored chronologically (live cycle = `len(Repetitions)+1`, `derive.go:12`); an out-of-order array attaches a pre-log summary to the wrong watch | Med | Design verifies the order against `internal/anime/store/testdata` stored-shape fixtures before relying on the array index |
| Ascending keyset skips or repeats a row at a page boundary | Med | Mirrored comparator with boundary tests on equal `watched_at_ms`; `ditto` on `./internal/watchhistory/` |
| Anime-ID set exceeds SQLite's bound-parameter limit | Low–Med | Design question 4 |
| A restored selection names an anime whose row is not on the first loaded page | Med | Inspector keys off the anime, not the row; spec scenario |
| `anime-detail.helpers.ts` (435/500) crosses the hard cap | High if extended | Watch grouping in a new colocated helpers file |
| An owned table name spelled in `.ts`/`.tsx` fails `checkarchitecture`, whose commit job is globbed to Go files | Low | Run `go run ./tools/checkarchitecture` by hand on frontend units |
| Unit 5 exceeds the cap | High | Split in `sdd-tasks` (Size Forecast) |

## Rollback Plan

No schema, migration or data change is planned, so every unit reverts with `git revert`.

- Binding signature changes, the regenerated `wailsjs` and the adapter land in one unit, so a revert
  never leaves the frontend calling a signature the backend no longer has.
- URL params are inert after a revert: the current `/history` reads no query string (no live
  `useSearchParams` in the frontend).
- If design adds an index, it is additive (`CREATE INDEX IF NOT EXISTS`) and an older build ignores it.
- REST, WS and the mobile app are untouched, so no client needs a coordinated rollback.

## Dependencies

- SDD-69's `watch_history` table, read models and bindings, present on this branch.
- HeroUI 3.2.4 `ListBox.Section`, `Accordion`, `Tabs`, `DateRangePicker` (verified in explore.md).
- Conditional: `@internationalized/date` as a direct dependency.

## Success Criteria

- [ ] Search, watched range and the anime-ID set each narrow the global read in SQL before paging,
      asserted by store tests in both orders.
- [ ] Paging newest-first and oldest-first each returns every row exactly once, including rows that share
      `watched_at_ms` across a page boundary.
- [ ] A per-watch read returns only that anime's rows for that cycle.
- [ ] History renders the five filter controls; each row shows its status chip, and the Rewatch chip only
      when `cycle > 1`.
- [ ] Selecting a row updates the inspector and leaves the location unchanged; Enter on the selected row,
      the linked name and "Open anime detail" each navigate to that anime's detail.
- [ ] Filters and the selected anime serialize to URL params (absent at defaults), and Back from Anime
      Detail restores them.
- [ ] Anime Detail renders exactly one "Watch history" section; "Repetition history" and "Episode
      history" no longer render, and `AnimeRepetitionTimeline` is deleted.
- [ ] An anime with R repetitions shows R+1 watches newest first with "Current" only on watch R+1; a
      watch before 2026-07-05 shows Started / Premiere / Last watched / Ended.
- [ ] "All episodes" lists rows newest first, each with its "Watch K" chip and date · time.
- [ ] The History list, inspector and both tabs each render exclusive skeleton / empty / error states,
      with loading tests asserting the negative; both long lists carry a DOM-count guard.
- [ ] `docs/openapi.yaml` and the watch-history recording and backfill code have no diff.
- [ ] `go test ./...`, both golangci profiles, the frontend suite, `checkgofilesize` (empty baseline),
      `render:smoke` and a hand-run `checkarchitecture` pass.
