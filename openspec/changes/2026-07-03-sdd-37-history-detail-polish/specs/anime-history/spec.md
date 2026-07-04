# Delta for Anime History (Polish: Row Navigation, Filters, URL State)

## MODIFIED Requirements

### Requirement: History Table With Pagination, Search, and Filters
In addition to sdd-36's requirements: the ENTIRE row MUST act as the drill-down affordance (not
only the name), keyboard-accessible; the filter set MUST include Estado, Tipo, and an Orden
(sort) control offering Nombre A-Z, Últ Cap Visto (default, DESC), and Fecha Creación; the
search input MUST carry a visible "Search" label aligned with the other labeled controls.

#### Scenario: Whole row navigates to detail
- GIVEN a History row
- WHEN the user clicks/activates anywhere on the row
- THEN the app MUST navigate to that anime's shared detail

#### Scenario: Tipo filter and Orden sort
- GIVEN the visible Tipo filter and Orden control
- WHEN the user selects a tipo or a sort order
- THEN the table MUST reflect it, composable with search and Estado filter
- AND Orden defaults to Últ Cap Visto (recency DESC), matching the read model's server order

### Requirement: History State Survives Navigation (URL-Persisted)
Search, Estado, Tipo, Orden, and page MUST be encoded in the `/history` URL query string, so
drilling into a detail and coming back restores the exact prior view.

#### Scenario: Back from detail restores the exact spot
- GIVEN a user on /history page 3 with an active search and filters
- WHEN they open a row's detail and navigate back
- THEN the table MUST show page 3 with the same search and filters
