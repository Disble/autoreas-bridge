# Anime Update: Repeat and Restore Specification

Change: `2026-07-14-sdd-49-anime-repeat-restore-edit`
Capability: `anime-update-repeat-restore`

## Purpose

AnimeDetail MUST expose safe, base-aware Repeat and Restore actions that preserve
Legacy semantics and report whether a write applied.

## Requirements

### Requirement: Repeat starts a new cycle

Repeat MUST append the prior watch state to `repetir`, reset
`nrocapvisto=0`, `estado=0`, `activo=true`, clear deletion/premiere/last-watched
dates, and stamp `fechaCreacion` to the operation time.

#### Scenario: Repeat succeeds on nullable legacy metadata

- **GIVEN** a completed anime whose `duracion` is null and which has unknown fields
- **WHEN** a current-base Repeat is applied
- **THEN** its prior watch state is appended to `repetir`
- **AND** its watch fields reset for a new cycle
- **AND** the raw null and unknown fields remain unchanged

### Requirement: Restore changes only activation state

Restore MUST set `activo=true` and clear `fechaEliminacion`; it MUST NOT modify
other anime fields.

#### Scenario: Restore preserves history

- **GIVEN** an inactive anime with progress and repetition history
- **WHEN** a current-base Restore is applied
- **THEN** it becomes active and its deletion date is cleared
- **AND** progress, state, history, metadata, and unknown fields are unchanged

### Requirement: Base-aware OCC and outcomes

The Bridge UI MUST send `detail.modifiedAt`. Matching-base writes MUST return the
new token and `applied` or `no_op`. A stale explicit base with a differing result
MUST record a conflict, MUST return `conflict` plus the current token, MUST NOT
append or advance the token, and MUST trigger detail refetch and an informative
message. Base-less older legacy/mobile callers MAY retain staged observe-only
compatibility; the Bridge UI MUST NOT use that path.

#### Scenario: Stale base does not overwrite

- **GIVEN** AnimeDetail holds T1 and the anime has advanced to T2
- **WHEN** the user confirms Repeat or Restore with base T1
- **THEN** the outcome is `conflict` with T2 and a conflict is recorded
- **AND** no Legacy write is applied and AnimeDetail refetches and informs

### Requirement: Action visibility

Repeat MUST be visible only when `estado > 0`; Restore MUST be visible only when
`activo=false`.

#### Scenario: Eligible actions are visible

- **GIVEN** a finished inactive anime
- **WHEN** AnimeDetail renders
- **THEN** both "Repeat" and "Restore" are visible

#### Scenario: Ineligible actions are hidden

- **GIVEN** an active anime with `estado=0`
- **WHEN** AnimeDetail renders
- **THEN** neither action is visible

### Requirement: Confirmation prevents accidental writes

Both English-labeled actions MUST require explicit confirmation.

#### Scenario: Confirmation is cancelled

- **GIVEN** an action confirmation is open
- **WHEN** the user cancels
- **THEN** no gateway call or write occurs

### Requirement: Failure and missing-record behavior

A missing anime or gateway/read/parse/persistence failure MUST return an error,
MUST NOT report `applied`, and MUST NOT publish a success notification. A
successful update MUST refetch AnimeDetail; it MUST NOT directly invalidate
unrelated panels.

#### Scenario: Anime is missing

- **GIVEN** the selected anime no longer exists
- **WHEN** Repeat or Restore is confirmed
- **THEN** the UI reports the missing record and does not claim success

#### Scenario: Gateway write fails

- **GIVEN** the anime exists with a current base
- **WHEN** persistence fails
- **THEN** the action reports an error and does not claim `applied`
