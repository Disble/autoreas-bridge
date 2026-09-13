# Explore — SDD-72 History UI Redesign

Worktree: `autoreas-bridge-worktrees/sdd-69-real-history` (branch `feat/sdd-69-real-history`, HEAD `3263524`).
Approved design: the owner-approved artifact "Autoreas History Layouts", sections "History screen: day list,
inspector and full filters" and "Anime Detail: one Watch history, grouped by watch" (v3, 2026-09-13).

## Current State (file:line)

**Go read path**
- `internal/watchhistory/store_page.go:19-22` — `PageQuery{Limit, Cursor}` only.
- `store_page.go:114-135` `buildPageQuery` — a single `anime_id = ?` scope plus a DESC-only keyset cursor
  (`watched_at_ms < ? OR (watched_at_ms = ? AND id < ?)`). No search, date range, anime-ID set, cycle filter
  or ascending order.
- `store_page.go:79-87` — `Store.Page` / `Store.AnimePage` both call `queryPage`, the only entry points.
- `internal/watchhistory/schema.go:12-31` — columns `id, anime_id, anime_name, episode, cycle, watched_at_ms,
  source, source_activity_id`; indexes `idx_watch_history_watched_at(watched_at_ms DESC, id DESC)`,
  `idx_watch_history_anime(anime_id, watched_at_ms DESC, id DESC)`, unique `idx_watch_history_episode(anime_id,
  cycle, episode)`.
- `internal/watchhistory/derive.go:14-22` — `Change.Cycle` is the 1-based rewatch cycle (`len(Repetitions)+1`
  at write time). `WatchHistoryEntry.cycle` therefore already equals the design's "Watch N".
- `internal/desktop/app_runtime.go:197-219` — `GetWatchHistoryPage(cursor)` /
  `GetAnimeWatchHistoryPage(animeID, cursor)`, cursor-only.
- `app_runtime.go:221-229` — `GetAnimeDetailView` (structured DTO) has no frontend consumer; live
  `AnimeDetail.tsx` consumes the flat `GetAnimeDetail` (`MobileAnime`), which carries `Repetitions`.
- `app_runtime.go:161-170` — `GetAnimes()` → `animeQuery.ListAnimeItems(ctx)`, all anime as
  `contracts.AnimeListItem`.
- `internal/api/contracts/contracts.go:86-106` — `AnimeListItem{ID, Name, Status, EpisodesWatched,
  TotalEpisodes, Active, Kind, Days, Genres, HasDownloadPage, HasFolder}`: the only source for Status/Type,
  since the watch-history package holds no anime status or kind.
- `contracts.go:108-133` — `WatchHistoryEntry{ID, AnimeID, AnimeName, Episode, Cycle, WatchedAtMS, Source}`,
  `WatchHistoryPage{Items, NextCursor, Status, Message}`.
- `contracts.go:16-25` — `MobileRepeticion{NumRepetitions, EpisodesWatched, Status, CreatedAt, PremieredAt,
  LastWatchedAt, DeletedAt, RepeatedAt}`; TS `AnimeRepeticion` mirrors it (`shared/contracts/anime.types.ts:22-31`).
- `tools/checkarchitecture/main.go:32-35,102-105` — the owned-table literal rule restricts only the table-name
  string outside its owning package; new `PageQuery` fields inside the package are unaffected.

**Frontend — History screen**
- `features/history/ui/HistoryTimeline/` — `HistoryTimeline.tsx` (107), `use-history-timeline.ts` (98), types
  (19), constants (32): a flat day-grouped Button list, no filters, no selection or inspector.
- `shared/watch-history/watch-history.helpers.ts` (66) — `toLocalDayKey`, `formatDayHeading`, `formatRowTime`,
  `groupEntriesByDay`: pure and reusable by a day-sectioned `ListBox`.
- `app/routes/HistoryRoute.tsx` (22) — thin wrapper.
- No live `useSearchParams` usage in the frontend today; `CatalogFilterBar.tsx` keeps filters in memory.
- Retired precedent, recoverable from git: `git show 5cca549^:frontend/src/features/history/ui/HistoryTable/…`
  holds `parseHistoryParams` / `serializeHistoryParams` (`history-table.helpers.ts:217,238`) and
  `useHistoryParamsWriters` (`use-history-params-writers.ts`): params `q, estado, tipo, sort, page`, omitted at
  default, debounced search written with `replace: true`, filter changes pushed. Documented in
  `openspec/changes/2026-07-03-sdd-37-history-detail-polish/design.md` D2. (Orchestrator-verified; the explore
  agent had no git access.)
- `openspec/specs/anime-history/spec.md:77-88` — "The History Route Carries No Persisted Query State" is the
  requirement this change reverses.

**Frontend — Anime Detail**
- `AnimeDetail.tsx:191-200` renders "Repetition history" (`AnimeRepetitionTimeline.tsx`, 65) and
  `<AnimeWatchHistory>` (94 + hook 74) separately. `AnimeWatchHistory` fetches one page (50-row cap) with a
  truncation notice and no watch grouping.
- `anime-detail.helpers.ts` is 436 lines (500 hard cap). `toAnimeDetailViewModel` (399-435) maps repetitions via
  `sortAnimeRepeticionesMostRecentFirst` + `toAnimeRepeticionViewModel`.
- `use-anime-detail.ts` (130) — fetch, view model, cover, mutation, back navigation (`hasPreviousHistoryEntry`,
  helpers 381-388).
- Tests asserting the current two-section shape: `AnimeDetail.test.tsx` (419), `anime-detail.helpers.test.ts`
  (410), `AnimeRepetitionTimeline.test.tsx`, `AnimeWatchHistory.test.tsx`, `use-anime-watch-history.test.ts`,
  `use-anime-detail.test.tsx`.

## Gaps vs Approved Design

1. The History screen is a new composition (day-sectioned `ListBox` + inspector `Card` + selection), not an
   evolution of the Button list. Only the `shared/watch-history` helpers carry over.
2. "Repetition history" and "Episode history" merge into one "Watch history" `Tabs` section (By watch
   `Accordion`, All episodes list). `AnimeRepetitionTimeline` is retired; its dates move into the pre-log watch
   summary.
3. Filter plumbing (search, status, type, date range, sort, cycle) does not exist in the Go read path or the
   adapter signature.
4. URL-persisted filter and selection state has no live precedent; the retired 1.12.0 helpers are the model.

## Data/Query Needs

New `watchhistory.PageQuery` fields, all inside the owning package:
1. **Search** → `LIKE` on `anime_name` (no `NOCASE` collation today; decide case handling).
2. **Status/Type** → resolved outside the package from `GetAnimes()` (`Status`, `Kind`) into an
   `AnimeIDs []string` → `anime_id IN (...)`.
3. **Watched range** → `From`/`To` epoch-ms bounds on `watched_at_ms`.
4. **Sort** → ascending order needs its own mirrored keyset comparator and scan assumption, each tested; not a
   flag flip.
5. **Per watch** → `Cycle` → `anime_id = ? AND cycle = ?`, served by `idx_watch_history_anime`'s leading column.
6. No index serves an unscoped name search or date-range scan; the table grows ~24 rows/week today, so design.md
   should make the scan decision explicit.

## Component Choices (verified in `frontend/node_modules/@heroui/react/dist/components/*/index.d.ts`, 3.2.4)

- `ListBox.Section` exists (`list-box/index.d.ts:12`).
- `Accordion` (Root/Item/Heading/Trigger/Panel/Body) exists; first consumer here (the repo uses `Disclosure` in
  `AnimeCreateRow.tsx`, `AnimeEditorFormPanel.tsx`).
- `Tabs` — proven pattern in `SeasonWorkspace.tsx:145-191`.
- `DateRangePicker` exists; its value is `@internationalized/date` `DateValue`, a transitive dependency only
  (not in `frontend/package.json`). Using it needs `bun add @internationalized/date`, never a hand edit.
- `ProgressBar` — proven in `AnimeDetail.tsx:129-134`.
- `Avatar` exists but is unused; the cover slot precedent is `AnimeCoverPlaceholder` + `use-anime-detail-cover`.
- `SearchField` is used in `AnimeMetadataLookupModal.tsx` and `AnimeEditorListPanel.tsx`; `CatalogFilterBar.tsx`
  uses `Input type="search"`.

## Risks / Constraints

- `anime-detail.helpers.ts` at 436/500: watch grouping needs a new colocated helpers file.
- `@internationalized/date` must be added through the package manager if `DateRangePicker` stays.
- Ascending keyset paging needs its own comparator and tests.
- `checkarchitecture` scans `.ts`/`.tsx` too; never spell the owned table names outside their packages, comments
  included. The commit gate's `architecture` job is globbed to Go files, so run it by hand on frontend slices.
- CLAUDE.md FE rules: dumb `.tsx`, hook anatomy, readonly props, JSDoc on every declaration including tests,
  three exclusive states, ADR-012 live-list rule (`isNearListBottom`, no `useProgressiveListWindow`, no
  `Table.LoadMore`), 500-line caps.
- Six test files assert the replaced Anime Detail shape; rewriting them dominates slice size.

## Proposed Slicing (comparables: SDD-69 slices 6a = 644, 6b = 434, 8 = 462 changed lines)

1. **Go query plumbing** — `PageQuery` fields, mirrored ascending keyset, store tests. ~250–400.
2. **Bindings and contracts** — query-shaped bindings, status/type → anime IDs, per-row status/kind enrichment
   (decide in design), wailsjs regeneration, adapter types. ~200–350.
3. **History filter bar + URL state** — controls, parse/serialize helpers, params hook. ~400–600.
4. **History day list + inspector** — replaces `HistoryTimeline`. ~450–600.
5. **Anime Detail Watch history** — Tabs, Accordion per watch, All episodes, retire the two sections, new
   helpers file, rewrite affected tests. ~550–750 (likely needs a split).

Re-measure every slice with `wc -l` before commit (CLAUDE.md #22).

## Open Questions (for design, not blockers)

1. One `PageQuery` with `Cycle`, or a separate per-cycle method for the By watch accordion.
2. `DateRangePicker` with a new direct dependency, or plain date inputs.
