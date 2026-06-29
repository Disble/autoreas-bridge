# Spec — Season Mode Schedule UI

## ADDED Requirements

### Requirement: Schedule card signals season mode
When season mode is enabled, the Download Schedule card SHALL display an informational banner stating
that each run downloads the "Ver hoy" set regardless of the selected days. The weekday selector SHALL
remain visible and functional (it governs when the scheduler fires, not what it downloads).

#### Scenario: Banner shown when season mode is on
- GIVEN season mode is enabled
- WHEN the Download Schedule card renders
- THEN an info banner titled "Season mode is on" SHALL be visible
- AND the weekday selector SHALL still be rendered

#### Scenario: Banner hidden when season mode is off
- GIVEN season mode is disabled
- WHEN the Download Schedule card renders
- THEN the season-mode banner SHALL NOT be present
- AND the card SHALL render exactly as before

#### Scenario: Schedule reads the persisted flag without requiring the Options page
- GIVEN the user has not opened the Options page this session
- WHEN the Download Schedule card mounts
- THEN it SHALL load the persisted season-mode value (load-once refresh) and reflect it in the banner

### Requirement: Season-mode helper text is English and accurate
The SeasonModePanel helper text SHALL be in English and SHALL describe the real bridge effect
(scheduled downloads target the "Ver hoy" set), not the Legacy "Ver animes" behavior.

#### Scenario: Helper text describes the download effect in English
- WHEN the SeasonModePanel renders
- THEN the helper text SHALL read: When on, scheduled downloads grab the "Ver hoy" set instead of the shows airing today.
- AND it SHALL NOT contain the prior Spanish Legacy-UI sentence
