# Network UI Specification

## Purpose

Defines the DevTools-Network-style feature (`features/network/**`) that surfaces request/operation activity to the user, fed by the hexagonal read-model store and Wails port (see `frontend-architecture` spec). Network becomes the primary navigation entry and the app's index landing route.

## Requirements

### Requirement: Network Table Rendering

The Network feature MUST render a table of request/operation rows sourced from the `shared/store/` read-model, with columns including at minimum: Name/path, Status, Type/domain, and Duration.

#### Scenario: HTTP request rows render with zero backend changes
- GIVEN the backend already emits complete `http.request` observability entries (method, path, status, duration)
- WHEN the Network table renders
- THEN each `http.request` entry MUST appear as a row showing its path/name, status, type, and duration
- AND no backend code MUST be modified to produce this result

#### Scenario: Row selection drives detail panel
- GIVEN the Network table has one or more rows
- WHEN the user selects a row
- THEN a detail panel MUST display the full data for the selected row's `correlationId`

### Requirement: Filter and Search

The Network feature MUST provide a filter/search bar supporting a free-text query and a status filter, applied to the rows sourced from the store.

#### Scenario: Text query narrows rows
- GIVEN the Network table is populated with multiple rows
- WHEN the user enters a text query matching a subset of row names/paths
- THEN only rows matching the query MUST remain visible

#### Scenario: Status filter narrows rows
- GIVEN the Network table is populated with rows of mixed status
- WHEN the user selects a specific status filter
- THEN only rows matching that status MUST remain visible

#### Scenario: Combined filters
- GIVEN both a text query and a status filter are active
- WHEN both are applied
- THEN only rows satisfying both conditions MUST remain visible

### Requirement: Empty, Loading, and Capture-Unavailable States

The Network feature MUST handle the absence of data without crashing, using a Null Object default.

#### Scenario: No data yet (empty state)
- GIVEN the store has no request rows
- WHEN the Network feature renders
- THEN it MUST display an empty-state message instead of an empty table with no explanation

#### Scenario: Loading state
- GIVEN the initial fetch/subscription has not yet resolved
- WHEN the Network feature renders
- THEN it MUST display a loading indicator instead of a broken or blank table

#### Scenario: Capture unavailable (no Wails runtime)
- GIVEN the Wails runtime is unavailable (e.g. running in a plain browser/Vite context)
- WHEN the Network feature renders
- THEN it MUST display a capture-unavailable state via the Null Object default
- AND it MUST NOT throw or crash

### Requirement: Primary Navigation and Index Landing

The Network feature MUST be the first/primary entry in the top navigation, and the application's index route MUST redirect to the Network route.

#### Scenario: Network is first nav item
- GIVEN the application navigation bar
- WHEN the nav items are rendered
- THEN "Network" MUST appear as the first/primary item, ahead of existing items (e.g. Dashboard)

#### Scenario: Index route redirects to Network (user-visible change)
- GIVEN a user opens the application at its root/index route
- WHEN the app resolves the index redirect
- THEN the user MUST land on the `/network` route instead of the previous default (`/dashboard`)
- AND this is an intentional, user-visible navigation change to be verified explicitly
