# Delta for Anime History

## ADDED Requirements

### Requirement: History Filter Bar

The History surface MUST render five filter controls above the list: Search (by anime name),
Status, Type, a Watched date range, and Sort (Newest first / Oldest first). Search, Status, Type,
and the Watched range MUST each narrow the read in SQL before paging, not on already-loaded rows.
Sort MUST determine the read's paging order. Status and Type MUST filter by the anime's CURRENT
status and type, not its status or type at the time the episode was watched.

#### Scenario: A status filter narrows by the anime's current status

- GIVEN an anime whose status changed since an episode in its history was watched
- WHEN the Status filter is set to the anime's current status
- THEN that episode's row MUST appear, using the anime's current status, not its status at watch
  time

#### Scenario: A deleted anime drops out under Status or Type but stays under All

- GIVEN a history row for an anime that has since been deleted, so it has no current status or
  type
- WHEN a Status or Type filter other than "All" is applied
- THEN that row MUST be excluded
- AND WHEN the filter is "All" instead, THEN that row MUST render without a status chip

### Requirement: History State Persists In The URL And Restores On Back

The active filters (Search, Status, Type, Watched range, Sort) and the selected row's anime MUST
serialize to `/history`'s URL search params, each omitted when at its default value. Returning to
`/history` via Back from Anime Detail MUST restore those params. Scroll position MUST NOT be
restored.
(Reverses "The History Route Carries No Persisted Query State".)

#### Scenario: Default filters add no query string

- GIVEN a user who has not changed any filter and has not selected a row
- WHEN `/history` renders
- THEN the URL MUST remain `/history` with no query parameters

#### Scenario: Back from Anime Detail restores filters and selection

- GIVEN a user who set a Status filter, selected a row, and opened that anime's detail
- WHEN they press Back
- THEN `/history` MUST render with the same Status filter and the same row selected
- AND the list's scroll position MUST NOT be restored to where it was before navigating away

### Requirement: Selecting A Row Fills The Inspector Without Navigating

Selecting a history row MUST populate the inspector with that row's anime: cover, linked name,
status and type chips, watched progress, last watched date, added date, and its 3 most recent
episodes, without changing the route. Only pressing Enter on the selected row, activating its
linked name, or activating the inspector's "Open anime detail" button MUST navigate to that
anime's detail.
(Replaces "The Whole Row Drills Down To Anime Detail": the row no longer navigates on click alone.)

#### Scenario: Clicking a row updates the inspector, not the route

- GIVEN the History surface with an anime selected
- WHEN the user clicks a different row
- THEN the inspector MUST update to that row's anime
- AND the URL MUST remain `/history` with only the selection param changed

#### Scenario: Enter, the linked name, and the button each navigate

- GIVEN a row is selected
- WHEN the user presses Enter on it, or activates its linked name, or activates "Open anime
  detail" in the inspector
- THEN each of the three actions MUST navigate to that anime's detail

#### Scenario: A restored selection off the loaded page still fills the inspector

- GIVEN a selection restored from the URL for an anime whose row is not on the first loaded page
- WHEN `/history` renders
- THEN the inspector MUST show that anime's data, keyed by anime ID rather than by row position

## MODIFIED Requirements

### Requirement: Episode Timeline Is Grouped By Day

The History surface MUST render one row per watched episode, grouped under a heading for the
calendar day it was watched, with each day heading showing that day's episode count. Days and the
rows within each day MUST follow the active Sort: newest first by default, oldest first when Sort
is set to Oldest first. Each row MUST show the anime's name (truncating before its chips), a
status chip, a Rewatch chip when the episode's cycle is greater than 1, the episode number, and
the time.

Because the list is paged from the server, a day's rows MAY arrive across two pages. Every
complete group's count MUST be exact; the trailing group in the current sort direction MAY show a
partial count until a row from a further day proves that day complete.
(Previously: day and row order were fixed newest-first with no Sort control, and rows carried no
chips.)

#### Scenario: A day with multiple episodes shows its count

- GIVEN three episodes watched on the same calendar day
- WHEN the History surface renders that day
- THEN its heading MUST show a count of 3
- AND the three episode rows MUST appear under it, ordered by the active Sort

#### Scenario: Oldest first reverses day and row order

- GIVEN Sort is set to Oldest first
- WHEN the History surface renders
- THEN days MUST appear oldest first, and rows within each day MUST appear oldest first

#### Scenario: A row shows its status and Rewatch chips in order

- GIVEN a row for an episode recorded in cycle 2 of an anime currently "Viendo"
- WHEN that row renders
- THEN its status chip ("Viendo") MUST appear before its Rewatch chip
- AND an episode recorded in cycle 1 MUST render with no Rewatch chip

### Requirement: Loading, Empty, and Error States Are Exclusive

The History surface MUST render exactly one of three states at a time: a loading skeleton
mirroring the day/row shape, an explicit empty state when no history matches the active filters,
or an error state when the read fails. Content MUST NOT render while loading. The inspector MUST
follow the same rule independently: it MUST render exactly one of its own loading, empty (no row
selected), or error state.
(Previously: covered only the unfiltered list; did not cover a filtered zero-row result or the
inspector's own states.)

#### Scenario: Loading never shows stale or partial content

- GIVEN a history page request in flight
- WHEN the surface renders
- THEN only the loading skeleton MUST be visible, not the row list or the empty state

#### Scenario: An empty history is explicit, not a blank screen

- GIVEN a history read that succeeds with zero rows and no filters applied
- WHEN the surface renders
- THEN an explicit empty state MUST be shown, not an empty list with no messaging

#### Scenario: A filtered zero-row result is explicit too

- GIVEN filters that narrow the result to zero rows while unfiltered history exists
- WHEN the surface renders
- THEN an explicit empty state MUST be shown, distinct from the loading skeleton

#### Scenario: No selection leaves the inspector in its own empty state

- GIVEN a fresh `/history` visit with no row selected
- WHEN the surface renders
- THEN the inspector MUST render its own empty state, independent of the list's state

## REMOVED Requirements

### Requirement: The History Route Carries No Persisted Query State

(Reason: Decision (a) reverses this; filters and the selected anime now persist in URL search
params.)
(Migration: see ADDED "History State Persists In The URL And Restores On Back".)

### Requirement: The Whole Row Drills Down To Anime Detail

(Reason: selecting a row now fills the inspector instead of navigating; only Enter, the linked
name, and the button navigate.)
(Migration: see ADDED "Selecting A Row Fills The Inspector Without Navigating".)
