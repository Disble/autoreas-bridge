# Verifying design claims

jsdom has no layout engine, no image decoder and no container queries. `toHaveClass('break-all')`
proves a string is present, not that anything wrapped; a half-height skeleton and an undecodable
WebP both pass unit tests. Layout and render claims are proven in a real browser.

## Layout fixtures and `layout:smoke`

`bun --cwd="frontend" run layout:smoke` (`frontend/scripts/layout-smoke.mjs`) builds the fixture
bundle, renders it in headless Edge and reads the verdict each fixture writes into
`data-layout-verdict`. The run passes only when every fixture passes. It runs in the lefthook
pre-commit gate as `frontend-layout-smoke`.

- Fixtures live in `frontend/scripts/layout-fixtures/` and are mounted from `main.tsx`: Activity
  detail cards, Airis empty states, loading skeletons, Season Intake, Ordering and Overview, plus the
  notification toasts.
- Fixtures **import** the production components and class constants; a fixture that restates the
  markup keeps passing after the component regresses.
- It renders at **two viewports**, `1280x900` and `1600x1000`. A component that changes size at a
  breakpoint needs both: at 1280 the Transactions body pane is 166px, so a re-added `max-h-64` is
  inert there; at 1600 it fills 294px and the cap bites.
- Prove a new fixture non-vacuous: revert the fix (or mutate the class) and watch it fail.
- Measure boxes, not attributes: `naturalWidth` proves image bytes decoded; `width={512}` does not.
- For fill problems, measure the dead band, and include ordinary chrome as well as hostile content
  (`foundations/layout.md`).

## `render:smoke`

`bun --cwd="frontend" run render:smoke` proves the production bundle paints. Run it before claiming a
build works, when adding a route, or when investigating a blank WebView (HashRouter routes use
`/#/...`). A healthy backend startup does not prove a visible frontend.

## Unit tests with React Aria in jsdom

- React Aria `usePress` responds to native `.click()` / `fireEvent.click` (virtual press); selection,
  tab change and `CloseButton.onPress` fire without `@testing-library/user-event` (not installed).
- A single-select `ToggleButtonGroup` exposes options as `role="radio"`, not `role="button"`.
- A weekday-dependent query makes the suite date-dependent: once a tab carries a today marker,
  `getByRole('radio', { name: 'Friday' })` breaks every Friday. Pin the clock
  (`vi.useFakeTimers({ shouldAdvanceTime: true })` plus `vi.setSystemTime`).
- Hidden-text naming gotcha (`Sundaytoday`): see `foundations/typography.md`.
- Loading tests assert the negative (`patterns/loading-empty-error.md`).
- Assert structure and outcomes the user sees; do not pin prose nothing observes.

## Today marker (worked example)

The current-day marker on the Today weekday tabs is a `size-1.5 rounded-full bg-current` dot plus an
`sr-only` phrase. `bg-current` is load-bearing: `.toggle-button` sets `color` in both states
(`currentColor` unselected, `--accent-soft-foreground` selected), so a fixed `bg-accent` would vanish
on the selected tab.
