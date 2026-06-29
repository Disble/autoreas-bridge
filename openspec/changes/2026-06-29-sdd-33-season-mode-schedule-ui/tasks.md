# Tasks — 2026-06-29-sdd-33-season-mode-schedule-ui

> Artifact store: hybrid · Strict TDD active · Branch: feat/sdd-31-season-mode (stacked) · Frontend only

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~90 frontend (impl + tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

## Phase 1 — SeasonModePanel helper text (RED → GREEN)
- [x] 1.1 [RED] Update `features/preferences/ui/SeasonModePanel/__tests__/SeasonModePanel.test.tsx`: assert helper text is the English string `When on, scheduled downloads grab the "Ver hoy" set instead of the shows airing today.` and assert the old Spanish sentence is absent. Confirm it fails.
- [x] 1.2 [GREEN] Set `SEASON_MODE_HELPER_TEXT` in `season-mode-panel.constants.ts` to the English string. Test passes.

## Phase 2 — Schedule hook season awareness (RED → GREEN)
- [x] 2.1 [RED] Update `features/download/ui/SchedulePanel/__tests__/use-schedule-panel.test.ts`: with `usePreferencesStore` reporting `seasonMode:true`, `viewModel.seasonModeActive` is true; with false, it is false; the hook calls `refresh` on mount. Mock the preferences store the way other hook tests mock stores. Confirm failing.
- [x] 2.2 [GREEN] In `use-schedule-panel.ts`: add `usePreferencesStore` (section 3), a mount `refresh()` effect (section 7), and derived `seasonModeActive` in the returned `viewModel`. Preserve strict hook anatomy order. Test passes.

## Phase 3 — Schedule banner (RED → GREEN)
- [x] 3.1 [RED] Update `features/download/ui/SchedulePanel/__tests__/SchedulePanel.test.tsx`: banner titled "Season mode is on" present when `seasonModeActive` true; absent when false; weekday selector still rendered in both. Confirm failing.
- [x] 3.2 [GREEN] In `SchedulePanel.tsx`: render a HeroUI `Alert status="default"` (title + description constants from `schedule-panel.constants.ts`) near the top of `Card.Content`, only when `viewModel.seasonModeActive`. Add the two copy constants. Dumb UI only — no store/Wails/useEffect in the tsx. Test passes.

## Phase 4 — Verification
- [x] 4.1 `bun --cwd=frontend run test` — all vitest green.
- [x] 4.2 `bun --cwd=frontend run validate` — tsc + ESLint + filesize clean; no file over 500 effective lines.
