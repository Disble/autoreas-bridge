# Delta for Anime History (Legacy Parity Rework)

User verdict after testing sdd-35 (2026-07-03): History as a Catalog lens was rejected; the
repetition-centric card list does not resemble the Legacy "Historial" screen. This delta REVERSES
sdd-35's IA requirement and REPLACES the read model. UX bar: Legacy parity is the functional
floor; the implementation MUST improve on the original to 2026 UX standards, not pixel-clone it.

## REMOVED Requirements

### Requirement: History Reached Without an 8th Bottom-Nav Tab
**Reason**: User explicitly rejected the segmented Catalog/History lens after testing and
requires History as its own top-level section; an 8th nav entry is explicitly accepted.
**Migration**: `CatalogLensSwitch` is deleted; `/catalog/history` route is replaced by a
top-level `/history` route with its own nav entry.

## MODIFIED Requirements

### Requirement: History Read Model
The system MUST provide a read-only History surface listing animes by watch recency — a
watch-activity log equivalent to Legacy "Historial" — NOT a repetition-centric list. Membership:
animes with watch activity (a present `fechaUltCapVisto`). Ordering: `fechaUltCapVisto`
descending (most recently watched first). Sorting and membership MUST be applied server-side in
the bridge (Go), not in the frontend, via a dedicated slim history read model that carries at
minimum: id, nombre, nrocapvisto, fechaUltCapVisto (epoch millis), estado. No new persistence and
no write path.

#### Scenario: History lists animes by watch recency
- GIVEN animes with differing `fechaUltCapVisto` values
- WHEN the History surface renders
- THEN entries MUST appear ordered by `fechaUltCapVisto` descending
- AND animes without any `fechaUltCapVisto` MUST NOT appear

#### Scenario: History row shows Legacy Historial columns
- GIVEN a History entry
- WHEN its row renders
- THEN it MUST show: row number (Núm), Nombre, Núm Cap Vistos, Fecha Últ Cap Visto (long-form
  date), Día (weekday derived from the same timestamp), Hora (time derived from the same
  timestamp), and Estado rendered as a semantic status badge (not a bare icon)

#### Scenario: History surface is read-only
- GIVEN the History surface
- WHEN a user interacts with any entry (including drill-down to Detail)
- THEN no write/patch/reconcile call MUST be triggered by History itself

## ADDED Requirements

### Requirement: History Is Its Own Top-Level Section
History MUST be a top-level section with its own navigation entry (an 8th nav item) and its own
route identity, separate from Catalog. Catalog MUST revert to a single-purpose inventory surface
with no embedded History lens.

#### Scenario: History has its own nav entry
- WHEN the app navigation renders
- THEN it MUST contain a "History" entry navigating to the History section, in addition to
  "Catalog"

#### Scenario: Catalog no longer embeds History
- GIVEN the Catalog surface after this change
- WHEN it renders
- THEN no Catalog/History segmented control MUST be present, and Catalog copy MUST describe the
  inventory only

### Requirement: History Table With Pagination, Search, and Filters
The History surface MUST render as a table (real HeroUI table primitives, themed) with numbered
pagination, instant debounced search over anime name, and discoverable (visible, not icon-only)
filter controls (at minimum by estado). Loading MUST show a skeleton state; an empty result MUST
show an explicit empty state.

#### Scenario: Pagination bounds the visible rows
- GIVEN more history entries than one page holds
- WHEN the surface renders
- THEN only the current page's rows MUST be visible, with numbered pagination controls to
  navigate, and the row numbering (Núm) MUST continue across pages

#### Scenario: Search narrows rows without a submit step
- GIVEN a user typing into the search field
- WHEN they pause typing (debounce)
- THEN the table MUST show only entries whose name matches, without a page reload or submit
  action

#### Scenario: Filter by estado
- GIVEN the visible filter control
- WHEN the user selects an estado filter value
- THEN only entries with that estado MUST remain visible, composable with active search

#### Scenario: Loading and empty states
- WHEN History data is loading, a skeleton table state MUST render
- WHEN zero entries match the current search/filter, an explicit English empty-state message
  MUST render

### Requirement: History Timestamps Read Well
Date/time presentation MUST exceed the Legacy floor: each row MUST show the absolute date
(long form) plus derived weekday and time, and SHOULD show relative recency (e.g. "2 days ago")
where it aids scanning. UI chrome (headers, empty states, filter labels) MUST be English; data
literals originating from Legacy stay Spanish verbatim.

#### Scenario: One timestamp drives date, weekday, and time
- GIVEN an entry with `fechaUltCapVisto`
- WHEN the row renders
- THEN the long date, weekday, and time columns MUST all derive from that single timestamp via
  tested helpers
