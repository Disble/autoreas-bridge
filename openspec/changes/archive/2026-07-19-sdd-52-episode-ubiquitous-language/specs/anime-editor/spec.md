# Delta for Anime Editor

## MODIFIED Requirements

### Requirement: Dedicated workspace and reusable deep-link editor

The system MUST provide a dedicated **Anime Editor** section with a watching-first searchable and filterable list, and it MUST reuse the same ID-driven editor when Anime Detail launches **Edit anime**. Catalog MUST remain the complete local collection, History MUST remain a read-only activity log, and Episodes MUST remain the today-progress surface.

(Previously: the today-progress surface was named "Chapters"; SDD-52 renames it
to "Episodes" as part of the repo-wide vocabulary standardization. No workspace
behavior changes.)

#### Scenario: Workspace opens for rapid consecutive edits

- **GIVEN** the user opens Anime Editor from navigation
- **WHEN** the workspace loads
- **THEN** the left panel shows a watching-first list with search and filters
