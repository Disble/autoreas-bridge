# Spec — Season Mode Download Selection

## ADDED Requirements

### Requirement: Download run selects by season-mode target day
The download run SHALL select candidate animes by matching a single target `dia` against each
anime's `dias` array, where the target depends on the persisted season-mode flag. The `activo == 1`
gate SHALL always apply regardless of season mode.

#### Scenario: Season mode off selects today's weekday (unchanged)
- GIVEN season mode is disabled
- AND an active anime whose `dias` contains today's Spanish weekday name
- AND an active anime whose `dias` contains "Ver hoy"
- WHEN a download run lists the animes to process
- THEN the weekday anime SHALL be selected
- AND the "Ver hoy" anime SHALL NOT be selected

#### Scenario: Season mode on selects the "Ver hoy" set
- GIVEN season mode is enabled
- AND an active anime whose `dias` contains "Ver hoy"
- AND an active anime whose `dias` contains today's Spanish weekday name
- WHEN a download run lists the animes to process
- THEN the "Ver hoy" anime SHALL be selected
- AND the weekday anime SHALL NOT be selected

#### Scenario: Active gate still applies in season mode
- GIVEN season mode is enabled
- AND an anime whose `dias` contains "Ver hoy" but with `activo == 0`
- WHEN a download run lists the animes to process
- THEN that anime SHALL NOT be selected

#### Scenario: Season mode on with no "Ver hoy" animes yields no_animes_today
- GIVEN season mode is enabled
- AND no active anime has "Ver hoy" in its `dias`
- WHEN a download run executes
- THEN the run SHALL finalize with terminal status `no_animes_today`

### Requirement: Season-mode flag is read safely by the download service
The download service SHALL read the season-mode flag through an injected seam that defaults to
`false` (normal weekday selection) when unavailable, and SHALL NOT panic if the underlying
preferences store is nil or returns an error.

#### Scenario: Missing season-mode seam defaults to weekday selection
- GIVEN the download service is constructed without a season-mode seam
- WHEN a download run lists the animes to process
- THEN selection SHALL use today's Spanish weekday (season mode treated as off)

#### Scenario: Preferences store error degrades to off
- GIVEN the wired season-mode reader's underlying preferences store returns an error
- WHEN the download service reads the flag
- THEN it SHALL be treated as `false` and the run SHALL NOT panic
