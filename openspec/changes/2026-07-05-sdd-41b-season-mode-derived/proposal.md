# Proposal — sdd-41b-season-mode-derived

## Intent

Make season mode a DERIVED state of "is there an open season?" and remove the
standalone Options toggle. The Season section becomes the single source of truth:
opening a season turns season mode on; closing it turns it off.

## Why

Season mode's only effects are season-workflow-specific (downloads select
"Ver hoy", Chapters groups by the Estrenos sections where grading happens,
mobile status echoes the flag). There is no legitimate use of season mode
outside a selection season — the manual toggle was a placeholder for the missing
workflow. Now that the Season section owns the workflow, the toggle is redundant
and the only way to reach an inconsistent state (mode on with no season, or a
season open with mode off). Superseding part of SDD-31's standalone-toggle
design (recorded drift).

## Scope

- Backend: `seasonModeReader()` (the shared seam feeding downloads + mobile
  status) and `GetSeasonMode()` now derive from `ActiveSeason() != nil`. Remove
  `SetSeasonMode()`. Broadcast the derived flag over `preferences_changed` on
  season open/close (unchanged mobile contract). Delete the now-orphaned
  `internal/preferences` package.
- Frontend: remove the `SeasonModePanel` toggle and its Options card; keep
  read-only `getSeasonMode` (Chapters + Downloads schedule still read it). Show
  "Season mode is active while this season is open" in the Season Workspace
  Overview.

## Out of scope

- The `app_settings` KV table stays (generic, harmless) — only its `season_mode`
  usage is removed.

## Reference

Design decision recorded in engram `architecture/season-selection-workflow`.
