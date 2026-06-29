# Proposal — 2026-06-29-sdd-33-season-mode-schedule-ui

## Why
SDD-31 added the season-mode toggle + state; SDD-32 made Downloads select the "Ver hoy" set when the
flag is on. Two UI gaps remain:

1. The Downloads **Schedule** card shows a "Run on these days" weekday selector whose copy implies the
   days drive WHAT is downloaded. With season mode on, the selection is the "Ver hoy" set regardless
   of weekday — the card is now misleading without an indicator.
2. SDD-31's **SeasonModePanel** helper text was written in Spanish AND describes a Legacy "Ver animes"
   behavior that does not exist in the bridge. It must be English and describe the real effect
   (downloads target the "Ver hoy" set). The bridge frontend is English; Legacy screenshots are Spanish.

## What changes
- **SchedulePanel**: when season mode is on, render an info banner. The weekday selector stays (it
  controls WHEN the scheduler fires, not WHAT it downloads). Copy (approved):
  > **Season mode is on** — Each run downloads the "Ver hoy" set, regardless of the days selected below.
- **SeasonModePanel** helper text (approved), replacing the Spanish string:
  > When on, scheduled downloads grab the "Ver hoy" set instead of the shows airing today.

## Impact
- `use-schedule-panel.ts` reads the season flag from `usePreferencesStore` (load-once `refresh` on
  mount) and exposes `seasonModeActive` in its view model.
- `SchedulePanel.tsx` (dumb) renders a HeroUI `Alert` (status info) when `seasonModeActive` is true.
- `season-mode-panel.constants.ts` `SEASON_MODE_HELPER_TEXT` → the English string.
- Tests updated/added first (TDD): schedule hook + panel banner; SeasonModePanel helper text assertion.

## Scope
- IN: the two copy/UI updates above.
- OUT: no backend change; no change to the weekday selector's behavior or the scheduler; no relabel of
  the card title or the weekday selector (banner-only approach, approved Option A).

## Risks
- The `dia` literal "Ver hoy" stays Spanish inside the copy because it is a legacy DATA value the user
  recognizes; only the surrounding UI chrome is English.
- The Schedule card lives on the Downloads route; `usePreferencesStore` must be loaded there too —
  the load-once `refresh()` from the schedule hook covers the case where Options was never opened.
