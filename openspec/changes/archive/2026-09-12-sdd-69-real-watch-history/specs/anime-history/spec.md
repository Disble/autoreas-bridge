# Anime History Specification

> **Why this is a full spec, not a delta**: `anime-history` has no promoted spec under
> `openspec/specs/`. It exists only as delta specs inside three changes that were never archived
> (`2026-07-03-sdd-35-catalog-history`, `2026-07-03-sdd-36-history-legacy-parity`,
> `2026-07-03-sdd-37-history-detail-polish`). SDD-69 replaces that contract wholesale, so this file
> is a complete spec carrying forward the requirements those three changes established that
> survive this rewrite, rather than a delta against a parent that does not exist.

## Purpose

The global, browser-style watch history: a day-grouped list of every episode watched, newest
first, read from the `watch-history` global read model.

## Requirements

### Requirement: Episode Timeline Is Grouped By Day

The History surface MUST render one row per watched episode, grouped under a heading for the
calendar day it was watched, with each day heading showing that day's episode count. Days MUST be
ordered newest first, and rows within a day MUST be ordered newest first.

Because the list is paged from the server, a day's rows MAY arrive across two pages. Every complete
group's count MUST be exact; the trailing group — the oldest day loaded so far — MAY show a partial
count until a row from an older day proves that day complete.

#### Scenario: A day with multiple episodes shows its count

- GIVEN three episodes watched on the same calendar day
- WHEN the History surface renders that day
- THEN its heading MUST show a count of 3
- AND the three episode rows MUST appear under it, most recent first

### Requirement: The Whole Row Drills Down To Anime Detail

Every history row MUST act as the drill-down affordance to that episode's anime detail,
keyboard-accessible, not only a name or icon within the row.
(Carried forward from "History Table With Pagination, Search, and Filters", sdd-36/sdd-37;
pagination, search, filters, and sort are retired, but whole-row navigation survives.)

#### Scenario: Activating a row navigates to that anime's detail

- GIVEN a history row for a given anime
- WHEN the user clicks or activates anywhere on the row
- THEN the app MUST navigate to that anime's shared detail view

### Requirement: Loading, Empty, and Error States Are Exclusive

The History surface MUST render exactly one of three states at a time: a loading skeleton
mirroring the day/row shape, an explicit empty state when no history exists, or an error state
when the read fails. Content MUST NOT render while loading.

#### Scenario: Loading never shows stale or partial content

- GIVEN a history page request in flight
- WHEN the surface renders
- THEN only the loading skeleton MUST be visible, not the row list or the empty state

#### Scenario: An empty history is explicit, not a blank screen

- GIVEN a history read that succeeds with zero rows
- WHEN the surface renders
- THEN an explicit empty state MUST be shown, not an empty list with no messaging

### Requirement: The List Renders Progressively

Because `watch_history` retention is permanent, the list MUST render an initial batch and grow it
as the user scrolls near the bottom, never mapping the full result set into the DOM at once.

#### Scenario: Rendered row count stays bounded on scroll

- GIVEN a history with more rows than the initial batch size
- WHEN the surface first renders
- THEN the DOM row count MUST match the initial batch size, not the full row count
- AND scrolling near the bottom MUST grow the DOM row count by one further batch

### Requirement: The History Route Carries No Persisted Query State

The `/history` route MUST NOT encode search, filter, sort, or page state in its URL. The route is
always `/history` with no query string, replacing the retired `q`/`estado`/`tipo`/`sort`/`page`
contract.

#### Scenario: The URL never grows query parameters

- GIVEN a user browsing the History surface, scrolling and drilling into rows
- WHEN they return to `/history`
- THEN the URL MUST remain exactly `/history`, with no query parameters added by History
  interactions

### Requirement: History Timestamps Read Well

Each row's displayed time-of-day MUST derive from tested helpers, and each day heading's date
MUST derive from the same timestamp family as its rows, so the heading and its rows never
disagree.

#### Scenario: A row's time and its day heading's date agree

- GIVEN an episode watched at a given timestamp
- WHEN it renders under a day heading
- THEN the heading's date and the row's time MUST both derive from that same timestamp via tested
  helpers

### Requirement: History Is Its Own Top-Level Section

(Carried forward unchanged from sdd-36.) History MUST be a top-level section with its own
navigation entry and its own route identity, separate from Catalog.

#### Scenario: History has its own nav entry

- WHEN the app navigation renders
- THEN it MUST contain a "History" entry navigating to the History section, in addition to
  "Catalog"

### Requirement: English UI Copy with Spanish Data Literals Preserved

(Carried forward unchanged from sdd-35.) All History UI copy MUST be in English. Data literals
that mirror Legacy/domain values MUST remain in their original Spanish form.

#### Scenario: History labels render in English

- WHEN the History surface renders
- THEN all UI chrome (headings, empty-state text, error text) MUST be in English

#### Scenario: Data literals stay Spanish

- GIVEN a data-origin literal displayed in a history row
- WHEN it renders
- THEN it MUST remain in its original Spanish form
