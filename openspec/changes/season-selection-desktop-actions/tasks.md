# Tasks: Season Selection Desktop Actions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend overlay + DTO fields + openapi doc | PR 1 | Small, self-contained; ~80-100 lines |
| 2 | Shared `AnimeDesktopActions` component + Episodes refactor | PR 1 | ~150 lines incl. test |
| 3 | Selection plumbing + Actions column | PR 1 | ~120 lines incl. test |

Single PR is workable if total stays near 400; if diff review during apply exceeds ~450 lines, split Unit 1 into PR 1 and Units 2-3 into PR 2 (stacked-to-main) — flag to orchestrator before commit.

### Actual apply-time line count (flag to orchestrator)

Implementation is complete (all 26 tasks, all gates green), but the actual diff
exceeded the ~450-line stop threshold: `git diff --stat` on tracked files is
280 insertions + 63 deletions = 343 changed lines, PLUS 5 new untracked files
totaling 250 lines (`AnimeDesktopActions.tsx`/`.types.ts`, `DesktopActionButton.tsx`/`.types.ts`,
`AnimeDesktopActions.test.tsx`) = **~593 total changed lines**. This exceeds the
forecasted 350-420 range mainly because of two unplanned colocation extractions
(`DesktopActionButton` pair) forced by `dlinter/strict-colocation` — see Phase 3/5
deviation notes. No code was reverted; the orchestrator should decide whether to
accept `size:exception` for a single PR or split post-hoc (e.g. Unit 1 backend
+ openapi doc note as PR 1, Units 2-3 shared component + Episodes + Selection as PR 2,
stacked-to-main) before commit.

## Phase 1: Backend Overlay (TDD)

- [x] 1.1 RED: extend `app_season_availability_test.go` — rename/replace `TestAnimeSectionsByIDUsesEnglishReadRecords` to assert `animeOverlaysByID` returns `map[string]animeOverlay{section, folderPath, pageURL}`, using `record.Value.Folder`/`record.Value.SourceURL` (`*string`) fixtures incl. nil pointers.
- [x] 1.2 GREEN: in `app_season_availability.go`, add `stringOrEmpty(*string) string` (package main) and replace `animeSectionsByID` with `animeOverlaysByID` returning the new struct map, reading `record.Value.Folder`/`record.Value.SourceURL`.
- [x] 1.3 Update all call sites of the old `animeSectionsByID` to the new `animeOverlaysByID` map (compile-check).
- [x] 1.4 RED: add DTO test in `app_season_availability_test.go` (or existing DTO test file) asserting created row `FolderPath`/`PageURL` equal overlay values, non-created row both `""`.
- [x] 1.5 GREEN: add `FolderPath`/`PageURL` (json `folderPath`/`pageUrl`) fields to `SeasonAnimeDTO` in `app_season_types.go`.
- [x] 1.6 GREEN: in `app_season.go`, wire `seasonAnimeDTOs` to overlay `FolderPath`/`PageURL` (and existing section) from `animeOverlaysByID` for created rows only.
- [x] 1.7 `go test ./...` green for this package.

## Phase 2: OpenAPI Documentation

- [x] 2.1 Update `docs/openapi.yaml` — document `folderPath`/`pageUrl` as additive `SeasonAnimeDTO` fields (schema + description note); confirm no REST path changes needed. DEVIATION: `SeasonAnimeDTO` is a Wails-only binding, never documented in `docs/openapi.yaml` (confirmed via repo-wide grep — no REST/mobile schema references it; the mobile `ActiveSeasonCandidate`/`ActiveSeasonSnapshot` schemas are a separate, unaffected contract). No openapi.yaml schema entry existed to extend, so none was added; instead the Go doc comment on `SeasonAnimeDTO` was updated to document the new fields and note they are Wails-only.

## Phase 3: Shared Desktop Actions Component (TDD)

- [x] 3.1 RED: write `frontend/src/shared/ui/__tests__/AnimeDesktopActions.test.tsx` — cases: left-click onPress calls `onOpenPage`/`onOpenFolder` with `animeId`; right-click (contextmenu, preventDefault) calls `onCopyPage`/`onCopyFolder`; tooltip renders `pageUrl`/`folderPath`; button hidden when `hasPage`/`hasFolder` is false. DEVIATION: the tooltip-content-on-hover case was replaced with a hover-intent-color assertion (`hover:text-accent`/`hover:text-success`) — HeroUI's react-aria-components Tooltip does not mount its popover content in jsdom without `@testing-library/user-event` (not installed), and this matches the existing `EpisodeScheduleCard.test.tsx` convention, which also never asserts tooltip-content visibility.
- [x] 3.2 GREEN: create `frontend/src/shared/ui/AnimeDesktopActions.types.ts` — readonly prop contract (animeId, hasPage, hasFolder, pageUrl, folderPath, onOpenPage, onCopyPage, onOpenFolder, onCopyFolder, optional icon overrides) with JSDoc.
- [x] 3.3 GREEN: create `frontend/src/shared/ui/AnimeDesktopActions.tsx` rendering page+folder buttons via a `DesktopActionButton` sub-component. DEVIATION: `DesktopActionButton` (Tooltip + isIconOnly Button) could not stay private/in-file — the `dlinter/strict-colocation` ESLint rule forbids a second root-level function/interface in a governed module. It was extracted to its own colocated pair `frontend/src/shared/ui/DesktopActionButton.tsx` + `DesktopActionButton.types.ts`, imported by `AnimeDesktopActions.tsx`. Functionally identical to the design's "private in-file" intent; one call site per card is preserved.
- [x] 3.4 Confirm test suite from 3.1 passes.

## Phase 4: Episodes Refactor (No Regression)

- [x] 4.1 Refactor `EpisodeScheduleCard.tsx` (lines ~49-92) to render `<AnimeDesktopActions />` instead of the inline Tooltip/Button block, mapping `row.id`/`row.hasPage`/`row.hasFolder`/existing open/copy handlers.
- [x] 4.2 Run existing Episodes colocated test suite — MUST stay green with zero changes to test expectations. Confirmed: 35/35 passing unchanged (EpisodeScheduleCard, EpisodeSchedulePanel, use-episode-schedule-panel).

## Phase 5: Selection Plumbing (TDD)

- [x] 5.1 Add `folderPath`/`pageUrl` readonly fields to `SeasonAnimeRow` (`season-source.types.ts`); confirm season-source mapping passes them through (Wails auto-flow, no explicit mapper). Confirmed no explicit DTO→row mapper exists; the Go json fields flow straight through via `wailsjs/go/models.ts` (regenerated, +4 lines).
- [x] 5.2 RED: update `selection-board.helpers.test.ts` — assert `toSelectionRows` carries `folderPath`/`pageUrl` and derives `hasPage`/`hasFolder` (non-empty string, mirrors Episodes derivation).
- [x] 5.3 GREEN: update `SelectionRow` (`selection-board.types.ts`) with `folderPath`/`pageUrl`/`hasPage`/`hasFolder`; update `toSelectionRows` in `selection-board.helpers.ts`.
- [x] 5.4 Update `use-selection-board.ts` to expose `onOpenPage`/`onCopyPage`/`onOpenFolder`/`onCopyFolder` callbacks sourced from `bridgeRuntimeSource`, following the Episodes `runDesktopAction` + toast pattern. DEVIATION: `runDesktopAction` itself lives in `selection-board.helpers.ts` (not inline in the hook), again due to `dlinter/strict-colocation` forbidding a second root-level helper function in the hook file.
- [x] 5.5 Update `SelectionBoard.tsx` — add an Actions `Table.Column` rendering `<AnimeDesktopActions />`; content is naturally shown only for `availability === 'created' && animeId !== ''` rows because `toSelectionRows` already excludes every other row from the `rows` array (no extra guard needed).
- [x] 5.6 Confirm `selection-board.helpers.test.ts` and any SelectionBoard colocated tests pass. Confirmed: selection-board.helpers.test.ts 21/21, use-selection-board.test.ts 5/5, SelectionBoard.test.tsx 8/8.

## Phase 6: Full Verification Gate

- [x] 6.1 `go test ./...` — all green.
- [x] 6.2 `go run ./tools/checkgofilesize` — no new oversized files (`app_season_availability.go` stays <=500 effective lines). "Go file size check passed."
- [x] 6.3 `gofmt -l .` — no diffs.
- [x] 6.4 `bun --cwd="frontend" run test` — all green in isolation for every suite touched (132/132 files, 1102/1102 tests) on a clean run; a full-suite run under load intermittently times out 3 unrelated `AnimeEditorWorkspace` tests (pre-existing flakiness, file untouched by this change — confirmed pass in isolated re-run).
- [x] 6.5 Frontend lint (project lint command) — clean (0 errors, 2 pre-existing warnings in an unrelated file).
- [x] 6.6 `bun --cwd="frontend" run filesize:warning` — advisory check; only pre-existing warning is `bridge-runtime-source.test.ts` (435 lines, untouched by this change), no new files over the warning threshold.
