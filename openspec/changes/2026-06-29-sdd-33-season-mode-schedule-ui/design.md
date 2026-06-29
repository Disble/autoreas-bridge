# Design — 2026-06-29-sdd-33-season-mode-schedule-ui

## Context (runtime truth)
- `frontend/src/features/download/ui/SchedulePanel/SchedulePanel.tsx` is dumb UI; all logic is in
  `use-schedule-panel.ts`, which returns `viewModel` consumed by the panel. The panel already renders
  a HeroUI `Alert` (the `willNeverRun` warning) — same primitive reused for the season banner.
- `frontend/src/shared/store/preferences-store.ts` exposes `usePreferencesStore` (SDD-31): load-once
  `refresh()`, `seasonMode` boolean, `hasLoaded`. Calling `refresh()` when already loaded is a no-op.
- `frontend/src/features/preferences/ui/SeasonModePanel/season-mode-panel.constants.ts` holds
  `SEASON_MODE_HELPER_TEXT` (currently the Spanish Legacy string).

## Decision 1 — season flag flows through the schedule hook, not the dumb panel
`use-schedule-panel.ts` reads `usePreferencesStore` (section 3: context/3rd-party hooks), selecting
`seasonMode` and `refresh`. A mount `useEffect` (section 7) calls `refresh()` once so the value is
present even if the user never opened Options. Derived `seasonModeActive = seasonMode` is added to the
returned `viewModel`. The dumb panel only reads `viewModel.seasonModeActive` — no store/Wails calls in
the `.tsx` (architecture rule).

Rationale: keeps the dumb-tsx rule and strict hook anatomy intact; mirrors how `SeasonModePanel` wires
the store through its hook.

## Decision 2 — banner is an additive Alert, selector unchanged (Option A, approved)
In `SchedulePanel.tsx`, render, only when `viewModel.seasonModeActive` is true, near the top of
`Card.Content` (above the Enable switch):
```tsx
<Alert status="info">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>Season mode is on</Alert.Title>
    <Alert.Description>Each run downloads the "Ver hoy" set, regardless of the days selected below.</Alert.Description>
  </Alert.Content>
</Alert>
```
The weekday `ToggleButtonGroup`, daily time, enable switch, and run-status block are untouched.
String lives in `schedule-panel.constants.ts` (no inline literals in the dumb tsx beyond JSX text is
acceptable, but prefer a constant for the title/description to keep copy in one place and testable).

## Decision 3 — SeasonModePanel helper text → English
`SEASON_MODE_HELPER_TEXT = 'When on, scheduled downloads grab the "Ver hoy" set instead of the shows airing today.'`
The `"Ver hoy"` substring stays Spanish (legacy data value).

## Test strategy (Strict TDD, vitest)
RED first:
1. `use-schedule-panel.test.ts`: when the preferences store reports `seasonMode: true`,
   `viewModel.seasonModeActive` is true; when false, it is false; the hook calls `refresh` on mount.
   (Mock `usePreferencesStore` the way existing hook tests mock their stores.)
2. `SchedulePanel.test.tsx`: renders the "Season mode is on" banner when `seasonModeActive` is true;
   does NOT render it when false; the weekday selector still renders in both cases.
3. `SeasonModePanel.test.tsx`: update the helper-text assertion to the new English string (replace the
   Spanish assertion); add nothing that re-introduces Spanish UI copy.
Then GREEN: implement the hook field, the banner, and the constant. Run `bun --cwd=frontend run test`
and `bun --cwd=frontend run validate`.

## Constraints
- Dumb `.tsx`: no Wails/useEffect/store calls; reads only the hook's view model.
- Hook anatomy order preserved; load `refresh` in the effects section.
- All `*Props` readonly; exported helpers (if any) need JSDoc; English UI copy only.
- Files stay < 500 effective lines.
