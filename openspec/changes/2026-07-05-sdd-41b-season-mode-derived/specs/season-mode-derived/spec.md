# Spec — season-mode-derived

## MODIFIED Requirements

### Requirement: Season mode is derived from the open season

Season mode SHALL be true exactly while a season is open, and SHALL NOT be
independently toggleable. Opening a season turns it on; closing turns it off.
The shared season-mode seam (downloads selection, mobile status) and the
`GetSeasonMode` binding SHALL read this derived value.

#### Scenario: no open season → season mode off

- **WHEN** there is no open season
- **THEN** season mode reads false (downloads use the weekday-airing set,
  Chapters groups by weekday)

#### Scenario: open season → season mode on

- **WHEN** a season is open
- **THEN** season mode reads true (downloads select "Ver hoy", Chapters groups
  by the Estrenos sections)

#### Scenario: closing a season turns season mode off

- **WHEN** the open season is closed
- **THEN** season mode reads false and a `preferences_changed` signal with the
  derived value is broadcast

### Requirement: No standalone season-mode toggle

The Options screen SHALL NOT expose a season-mode toggle; the Season Workspace
SHALL indicate that season mode is active while a season is open.

#### Scenario: Options has no season-mode toggle

- **WHEN** the user opens Options
- **THEN** there is no season-mode toggle control

#### Scenario: Season Workspace shows the active state

- **WHEN** a season is open
- **THEN** the Season Workspace states that season mode is active until the
  season is closed
