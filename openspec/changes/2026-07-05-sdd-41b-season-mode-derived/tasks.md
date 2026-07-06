# Tasks — sdd-41b-season-mode-derived

- [x] 1 Derive `seasonModeReader()` + `GetSeasonMode()` from `ActiveSeason() != nil`
- [x] 2 Remove `SetSeasonMode()` binding; broadcast derived flag on open/close (TDD)
- [x] 3 Remove `preferencesStore` field/factory; delete `internal/preferences`
- [x] 4 Regenerate Wails bindings (SetSeasonMode removed)
- [x] 5 Remove SeasonModePanel + its Options card; drop `setSeasonMode` from
      preferences-source/store (keep read-only getSeasonMode)
- [x] 6 Season Workspace shows "season mode active while open"
- [x] 7 Full lefthook gate green
