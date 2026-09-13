# Delta for Anime Create Editor

## MODIFIED Requirements

### Requirement: No modal-over-modal, no chip inputs, one transient lookup exception

The Create tab MUST render the batch grid and embedded board within the tab's own layout. The
Create surface itself MUST NOT be layered as a modal over the Editor workspace, and MUST NOT use
chip/tag-style inputs for any field. The tab MUST NOT nest a modal dialog for any purpose other
than the single exception below.

The only permitted nested dialog is a transient, user-invoked metadata lookup modal opened by a
**Fetch metadata** action. That action MUST NOT live inside a row's optional-metadata disclosure —
it MUST be reachable independent of the disclosure's expanded/collapsed state. The lookup modal
MUST close, by cancel or by confirm, back to the tab's inline layout, leaving no modal open
afterward.

(Previously: absolutely forbade nesting any modal dialog inside the tab. This narrows that
prohibition to preserve its intent — no modal-over-modal for the Create surface, no chip inputs,
inline optional-metadata disclosure — while permitting exactly one transient, user-invoked lookup
dialog kept outside that disclosure.)

#### Scenario: Optional metadata disclosure stays inline

- GIVEN the user expands a row's optional metadata
- WHEN the disclosure opens
- THEN the fields render inline within the row
- AND no new modal dialog is opened

#### Scenario: Fetch-metadata lookup is the sole permitted nested dialog

- GIVEN a batch row's Fetch metadata action is available
- WHEN the user activates it
- THEN a transient lookup modal opens over the tab
- AND it is the only modal dialog permitted to nest inside the Create tab

#### Scenario: Fetch-metadata action stays outside the optional-metadata disclosure

- GIVEN a batch row whose optional-metadata disclosure is collapsed
- WHEN the row renders
- THEN the Fetch metadata action is reachable without expanding the disclosure
- AND collapsing or expanding the disclosure does not show or hide the action

#### Scenario: Closing the lookup modal returns to the inline tab layout

- GIVEN the metadata lookup modal is open
- WHEN the user cancels or confirms a candidate
- THEN the modal closes
- AND the Create tab returns to its plain inline layout with no modal open
