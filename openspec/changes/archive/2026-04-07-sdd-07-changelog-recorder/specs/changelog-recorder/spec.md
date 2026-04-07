# Changelog Recorder Specification

## Purpose

Definir la persistencia de `AnimeChangedEvent` en SQLite como changelog `pending` para el dominio Sync.

## Requirements

### Requirement: AnimeChanged events are recorded as pending changelog rows

The system MUST persist each `AnimeChangedEvent` into SQLite `changelog` with an initial `pending` status.

#### Scenario: Event bus publication inserts changelog row
- GIVEN the changelog recorder is running
- WHEN an `AnimeChangedEvent` is published to the Event Bus
- THEN the recorder SHALL insert a row into `changelog`
- AND that row SHALL be marked as `pending`

### Requirement: Unrelated events are ignored by the recorder

The recorder MUST ignore non-`AnimeChangedEvent` messages.

#### Scenario: Different event type does not write changelog
- GIVEN the recorder is subscribed to the Event Bus
- WHEN an unrelated event is published
- THEN the recorder SHALL NOT insert a changelog row

### Requirement: SQLite bootstrap prepares changelog persistence

The system MUST ensure the `changelog` table exists before the recorder starts persisting events.

#### Scenario: Bootstrap creates changelog table
- GIVEN the bridge boots with a fresh SQLite database
- WHEN bootstrap runs
- THEN the database SHALL include the `changelog` table needed by the recorder
