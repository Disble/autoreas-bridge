# Anime Create Editor Specification

## Purpose

Provide a batch-capable Create tab inside the Anime Editor so users can add
multiple animes manually in one deferred submit, replacing Legacy "Agregar",
without a modal-over-modal flow and without chip-based inputs.

## Requirements

### Requirement: Create tab beside Library

The Anime Editor route MUST expose a **Create** tab alongside the existing
edit-only **Library** tab. The Create tab MUST NOT open as a modal layered
over the edit workspace.

#### Scenario: User switches to Create tab

- **GIVEN** the user is on the Anime Editor Library tab
- **WHEN** the user selects the **Create** tab
- **THEN** the batch create grid replaces the tab content in place
- **AND** no modal opens over the Library workspace

### Requirement: Batch grid with required and optional fields

Each row in the Create grid MUST require **Name** and **Page**. Each row MAY
disclose optional metadata (progress, total episodes, duration, cover) behind
a per-row expandable section. The grid MUST support adding and removing rows
before submit.

#### Scenario: Row missing Name or Page blocks submit

- **GIVEN** a batch row has an empty Name or Page
- **WHEN** the user attempts to submit the batch
- **THEN** the submit is blocked with visible validation feedback
- **AND** no create request is sent

#### Scenario: Optional metadata stays collapsed by default

- **GIVEN** a new batch row is added
- **WHEN** the row renders
- **THEN** progress, total episodes, duration, and cover fields are collapsed behind per-row disclosure
- **AND** the row remains valid for submit using only Name and Page plus a placement

### Requirement: Embedded schedule board as controlled input

The Create tab MUST embed the reused `AnimeScheduleOrdering` board as a
controlled input for day/order placement. Each draft row MUST require at
least one placement (a weekday or a special queue) before submit.

#### Scenario: Draft anime starts unplaced in staging

- **GIVEN** a new batch row is added
- **WHEN** the embedded board renders
- **THEN** the draft appears as a draggable card in staging
- **AND** it has not yet satisfied the minimum-one-placement requirement

#### Scenario: Row without any placement blocks submit

- **GIVEN** a batch row has Name and Page filled but no placement assigned
- **WHEN** the user attempts to submit the batch
- **THEN** the submit is blocked with visible validation feedback naming the unplaced row

### Requirement: Single deferred submit persists the whole batch

The Create tab MUST NOT persist any row individually. One submit action MUST
persist all valid batch rows, together with their placements and any shifted
existing-neighbor placements, as a single deferred transaction.

#### Scenario: Valid batch submits as one transaction

- **GIVEN** every batch row has Name, Page, and at least one placement
- **WHEN** the user submits the batch
- **THEN** exactly one create request is sent covering all rows
- **AND** no row is persisted before that submit

#### Scenario: Successful submit makes new records selectable

- **GIVEN** the batch submit succeeds
- **WHEN** the response is applied
- **THEN** the newly created animes become selectable in the Editor
- **AND** the Create tab clears its draft rows

### Requirement: No modal-over-modal, no chip inputs

The Create tab MUST render the batch grid and embedded board within the tab's
own layout. It MUST NOT nest a modal dialog inside the tab, and MUST NOT use
chip/tag-style inputs for any field.

#### Scenario: Optional metadata disclosure stays inline

- **GIVEN** the user expands a row's optional metadata
- **WHEN** the disclosure opens
- **THEN** the fields render inline within the row
- **AND** no new modal dialog is opened
