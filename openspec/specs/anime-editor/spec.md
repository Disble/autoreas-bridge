# Anime Editor Specification

## Purpose

Provide a dedicated desktop Anime Editor workspace and one reusable ID-driven editor flow for atomic single-record edits.

## UI Structure

```text
+--------------------------------------------------------------------------------+
| Anime Editor                                                                   |
+-------------------------------+------------------------------------------------+
| Search                        | Selected anime title / state / modified status |
| Watching-first filters        +------------------------------------------------+
|                               | Frequent editable fields                       |
| Scrollable anime list         |                                                |
| - selected/highlighted row    | [Schedule summary] [Open schedule editor]      |
| - status/activity metadata    |                                                |
|                               | More details (collapsed secondary metadata)    |
|                               |                                                |
| independent list scroll       +------------------------------------------------+
|                               | [Deactivate anime] [Discard changes] [Save]    |
+-------------------------------+------------------------------------------------+
                                  sticky action area; independent form scroll
```

## Design Inputs

- Design MUST define the exact editable field matrix for nullable metadata that remained unresolved in exploration.
- Design MUST keep `_id`, `modified_at`, `repetir`, and `primeravez` outside the general editable field set.

## Requirements

### Requirement: Dedicated workspace and reusable deep-link editor

The system MUST provide a dedicated **Anime Editor** section with a
watching-first searchable and filterable **Library** tab, and it MUST reuse
the same ID-driven editor when Anime Detail launches **Edit anime**. The
Anime Editor route MUST also expose a batch-capable **Create** tab beside
**Library** for adding new animes; the Create tab MUST NOT open as a modal
layered over the Library workspace. Catalog MUST remain the complete local
collection, History MUST remain a read-only activity log, and Episodes MUST
remain the today-progress surface.
(Previously: Anime Editor exposed only the edit-only Library workspace, with
no in-Editor path to create new animes.)

#### Scenario: Workspace opens for rapid consecutive edits

- **GIVEN** the user opens Anime Editor from navigation
- **WHEN** the workspace loads
- **THEN** the left panel shows a watching-first list with search and filters
- **AND** the right panel loads the selected anime in the shared editor flow

#### Scenario: Anime Detail deep-links into the same editor

- **GIVEN** the user is viewing Anime Detail for anime A
- **WHEN** the user chooses **Edit anime**
- **THEN** Anime Editor opens with anime A selected
- **AND** the selected anime remains highlighted after a successful save refresh

#### Scenario: Create tab opens without a modal

- **GIVEN** the user is on Anime Editor
- **WHEN** the user selects the **Create** tab
- **THEN** the batch create workspace renders in place of the tab content
- **AND** no modal opens over the Library workspace

### Requirement: Split-pane editor structure and semantic UI constraints

The workspace MUST keep the list panel and form panel independently scrollable, MUST keep frequent fields visible above **More details**, MUST show dirty state in the selected-anime area, and MUST keep the action area sticky. The UI MUST use semantic HeroUI v3 primitives and tokens, including SearchField or Input, Select or ToggleButtonGroup, Card or Surface, ScrollShadow, Button with `onPress`, and Alert for validation or conflict feedback. The design MUST NOT hardcode legacy colors or recreate Legacy styling.

#### Scenario: Frequent and secondary information stay separated

- **GIVEN** the selected anime has both frequent fields and secondary metadata
- **WHEN** the editor renders
- **THEN** frequent fields are visible without opening **More details**
- **AND** secondary metadata is grouped under **More details**

#### Scenario: Dirty state is visible while the form scrolls independently

- **GIVEN** the user edits a field in the form panel
- **WHEN** the form becomes dirty
- **THEN** the selected-anime header reflects unsaved changes
- **AND** scrolling the form does not move the list panel or hide the action area

### Requirement: General form scope and lifecycle separation

The general editor MUST edit only the fields allowed by the authoritative editor contract, MUST validate that contract before any write, and MUST NOT expose `_id`, `modified_at`, `repetir`, or `primeravez` as general editable fields. Repeat, Restore, and lifecycle history MUST remain outside the general form. `activo=false` MUST be presented as **Deactivate anime** and MUST represent deactivation, not deletion.

#### Scenario: Lifecycle actions remain outside the general form

- **GIVEN** the user opens Anime Editor for an eligible anime
- **WHEN** the form renders
- **THEN** Repeat, Restore, and lifecycle history are not part of the general editable field set
- **AND** excluded fields cannot be changed through the general form

#### Scenario: Deactivation uses accurate semantics

- **GIVEN** the user chooses **Deactivate anime**
- **WHEN** the change is saved successfully
- **THEN** the anime becomes inactive through `activo=false`
- **AND** the record is not treated as deleted or tombstoned

### Requirement: Unsaved-change guards control selection and navigation

When the editor has unsaved changes, the system MUST guard anime switching, navigation away, closing or reloading when the host can intercept it, and entry into schedule editing. The guard MUST offer to save and continue, discard and continue, or stay on the current editor state. Continuing after **Save** requires an applied save; failed or conflicted saves MUST keep the user on the current editor with feedback.

#### Scenario: Switching anime while dirty is guarded

- **GIVEN** anime A has unsaved changes and anime B is selected next
- **WHEN** the guard appears and the user chooses **Discard changes**
- **THEN** anime A changes are abandoned
- **AND** anime B becomes the selected editor target

#### Scenario: Dirty user cannot leave after a conflicted save attempt

- **GIVEN** the editor is dirty and the user chooses **Save and continue**
- **WHEN** the save returns `conflict` or `error`
- **THEN** navigation or selection change does not continue
- **AND** the editor shows the returned feedback on the current anime

### Requirement: Single-save authority and canonical publication

Each general save MUST be one atomic authoritative write for one anime. The system MUST validate before writing, MUST carry an explicit `modified_at` base token, MUST preserve unknown fields plus complete `estudios` and `portada`, MUST refresh authoritative data after success, and MUST clear dirty state only after success. An accepted save MUST produce exactly one canonical append, one `anime.changed` event, one changelog row, and one websocket broadcast. Stale, invalid, missing, or failed edits MUST append nothing.

#### Scenario: Applied save refreshes authority once

- **GIVEN** anime A is dirty with a current base token
- **WHEN** the user saves a valid edit
- **THEN** the result is applied once, Anime Editor reloads fresh authority, and dirty state clears
- **AND** only one canonical append and downstream publication set is emitted

#### Scenario: Invalid or stale edit is rejected without append

- **GIVEN** the editor submits a stale base or invalid field values
- **WHEN** the save is evaluated
- **THEN** the result is rejection feedback with refreshed authority when applicable
- **AND** no append, changelog row, or websocket broadcast is emitted
