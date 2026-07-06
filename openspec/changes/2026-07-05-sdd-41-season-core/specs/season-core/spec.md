# Spec — season-core

## ADDED Requirements

### Requirement: Single open season with lifecycle and parameters

The system SHALL persist a `Season` aggregate with an `open → closed`
lifecycle, at most one open season at a time, and per-season editable
parameters `min_approval_grade` (default 4) and `slots` (default 12).

#### Scenario: creating a season opens it with defaults

- **WHEN** a season is created with a name
- **THEN** it is persisted as the single open season with
  `min_approval_grade = 4` and `slots = 12`

#### Scenario: a second open season is rejected

- **GIVEN** an open season exists
- **WHEN** another season creation is attempted
- **THEN** it is rejected and the existing open season is unchanged

#### Scenario: closing a season is terminal

- **WHEN** the open season is closed
- **THEN** it has a `closed_at` timestamp and is no longer the active season

### Requirement: Verdict is derived, never stored (Excel parity)

The Aprobado/Reprobado verdict SHALL be derived from
`(nota, min_approval_grade, consideracion)` exactly as the 10-year Excel
formula, and SHALL NOT be persisted.

#### Scenario: passing grade with no consideration approves

- **WHEN** `nota >= min_approval_grade` and consideración is none
- **THEN** the verdict is Aprobado

#### Scenario: Falta Cupo rejects a passing grade

- **WHEN** `nota >= min_approval_grade` and consideración is Falta Cupo
- **THEN** the verdict is Reprobado

#### Scenario: Sobra Cupo rescues a failing grade

- **WHEN** `nota < min_approval_grade` and consideración is Sobra Cupo
- **THEN** the verdict is Aprobado

### Requirement: Season Workspace route

The frontend SHALL expose a `/season` route showing the active season's
Overview and a section-tab shell, with create-season and close-season actions;
mutations SHALL surface live via the `season_changed` broadcast.

#### Scenario: no open season

- **WHEN** the workspace loads with no open season
- **THEN** it shows an empty state with a create-season form prefilled with a
  date-derived suggested name

#### Scenario: open season overview

- **WHEN** a season is open
- **THEN** the Overview shows its name, an "Open" status, created date,
  nota mínima de aprobación, and slots, plus the section tabs
