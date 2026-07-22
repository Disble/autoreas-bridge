# Delta for Anime Editor

## MODIFIED Requirements

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
