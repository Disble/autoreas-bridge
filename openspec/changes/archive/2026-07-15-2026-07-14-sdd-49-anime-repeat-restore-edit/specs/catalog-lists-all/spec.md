# Catalog Lists All Animes Specification

Change: `2026-07-14-sdd-49-anime-repeat-restore-edit`
Capability: `catalog-lists-all`

## Purpose

Catalog MUST retain its current all-records default while Repeat and Restore
change status fields.

## Requirements

### Requirement: Default catalog includes active and inactive records

Without an explicit user filter, the backend list and frontend Catalog MUST
include every anime present in Bridge storage regardless of `activo`, `estado`,
or other status.

#### Scenario: Active and inactive records are visible

- **GIVEN** storage contains active anime A and inactive anime B
- **WHEN** Catalog loads with default filters
- **THEN** both A and B appear

#### Scenario: No silent status exclusion

- **GIVEN** storage contains an inactive non-watching anime
- **WHEN** no status filter is selected
- **THEN** the anime is not excluded because of `activo` or `estado`

### Requirement: Filtering is explicit

Status filtering MUST occur only after a user selects a status filter. Clearing
the filter MUST restore the all-records view.

#### Scenario: Explicit filter is reversible

- **GIVEN** active and inactive records are listed
- **WHEN** the user selects an active-only filter and later clears it
- **THEN** inactive records are hidden only while selected
- **AND** all records return after clearing it

### Requirement: Repeat and Restore preserve membership

Repeat and Restore MUST update displayed values without changing default Catalog
membership.

#### Scenario: Membership remains stable

- **GIVEN** an inactive anime is visible in default Catalog
- **WHEN** it is restored and later repeated
- **THEN** it remains visible throughout with updated values
