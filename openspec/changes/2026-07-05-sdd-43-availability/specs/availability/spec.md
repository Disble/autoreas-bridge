# Spec — availability

## ADDED Requirements

### Requirement: Anime creation

The system SHALL create a brand-new anime record (estado 0, nrocapvisto 0,
activo true, primeravez true, a single dias entry in a given section) through
the same durable write path as every other write, readable by Legacy.

#### Scenario: create lands in Sin ver

- **WHEN** an anime is created for "Sin ver"
- **THEN** its record has estado 0, activo true, and a dias entry `Sin ver`

### Requirement: Daily availability recheck

The system SHALL, while a season is open, recheck chapter-1 availability for
matched, still-waiting rows; a newly-available anime SHALL link to an existing
active anime with the same page or be created into "Sin ver", advancing the row
to created. The recheck SHALL be idempotent and SHALL NOT fail a whole run on a
single scrape error.

#### Scenario: newly available anime is created

- **WHEN** a waiting row's page now has chapter 1
- **THEN** the anime is created into "Sin ver" and the row becomes created

#### Scenario: rerun is a no-op

- **WHEN** the recheck runs again
- **THEN** already-created rows are skipped and no duplicate anime is created

#### Scenario: new availability notifies and chains downloads

- **WHEN** a recheck creates at least one anime
- **THEN** one aggregate "Available today" notification fires and a download run
  is triggered

### Requirement: Stage animes across Estrenos sections

The system SHALL let the user move an anime between Sin ver / Ver hoy / Visto
from the Daily Board, and re-check availability on demand.

#### Scenario: move to Ver hoy

- **WHEN** the user stages a created anime into "Ver hoy"
- **THEN** the anime's dias is set to `Ver hoy`
