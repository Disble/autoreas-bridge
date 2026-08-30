# Delta for activity-network-transactions

> Slice B. `Requirement: In-Process Transaction Read Binding`,
> `Requirement: Transaction List View`, `Requirement: Real-Time Push Of Capture Changes` and
> every pill/body requirement are unchanged and are deliberately not restated here.

## MODIFIED Requirements

### Requirement: Transaction List Filtering

The read binding MUST accept, and apply server-side over the whole capture table, filters for
exact HTTP status, HTTP status class (2xx/3xx/4xx/5xx), method/kind, route substring, outcome,
anime identifier, error code, device identifier, changelog identifier, and a `start_ms`/`end_ms`
time window, composed as a conjunction. The query contract MUST carry the device identifier and
the changelog identifier, so the two filters the observability search filter already supports
are reachable from the desktop app. A filter MUST NOT be applied only to the rows already
loaded in the view: matches outside the loaded page MUST remain reachable through pagination.
(Previously: the binding accepted only status class, method/kind, route substring, outcome and
a time window; status class and free text were in fact applied client-side over the newest
loaded page, and the query contract carried neither a device nor a changelog identifier.)

#### Scenario: Filter by status class
- GIVEN transactions with mixed 2xx/4xx/5xx statuses exist
- WHEN the frontend requests only the 5xx class
- THEN only transactions whose `http_status` falls in 500-599 MUST be returned
- AND the filter MUST be evaluated by the backend, not over the already-loaded rows

#### Scenario: No matches
- GIVEN filters that match no stored transaction
- WHEN the list binding is called
- THEN it MUST return an empty page with valid pagination metadata, not an error

#### Scenario: A match outside the loaded page is reachable
- GIVEN a transaction matching the active filters exists beyond the first page of results
- WHEN the filter is applied and the list is paged
- THEN that transaction MUST be reachable
- AND it MUST NOT be hidden because it was outside the initially loaded rows

#### Scenario: Device and changelog filters reach the whole table
- GIVEN captured transactions carry device identifiers and changelog correlations
- WHEN the list binding is called with a device identifier or a changelog identifier
- THEN only transactions matching that identifier MUST be returned, across the whole table

#### Scenario: Time window bounds the result
- GIVEN captured transactions span a wide time range
- WHEN `start_ms` and/or `end_ms` are supplied
- THEN only transactions captured within the inclusive window MUST be returned

## ADDED Requirements

### Requirement: Cursor-Paged Transaction Loading

The transaction list MUST consume the continuation cursor the read binding already returns,
appending each next page to the rows already loaded. Requesting the next page MUST NOT replace
the loaded rows, reset the active filters, reset the selected row, or reset scroll position.
When a page returns no continuation cursor, the list MUST stop offering more. Changing a filter
MUST restart pagination from the first page of the new query.

#### Scenario: The list reaches past the first page
- GIVEN more captured transactions match the active filters than one page holds
- WHEN the next page is requested with the returned cursor
- THEN its rows MUST be appended below the existing rows
- AND the previously loaded rows MUST remain rendered

#### Scenario: Paging preserves selection and filters
- GIVEN a row is selected and filters are active
- WHEN the next cursor page is appended
- THEN the selected row MUST remain selected and rendered
- AND the active filters MUST be unchanged

#### Scenario: Exhausted cursor ends pagination
- GIVEN the backend returned a page carrying no continuation cursor
- WHEN the list is asked for more
- THEN no further page request MUST be issued

#### Scenario: Changing a filter restarts pagination
- GIVEN several cursor pages have been appended
- WHEN the user changes a filter
- THEN the list MUST restart from the first page of the new query
- AND rows from the previous query MUST NOT remain in the list

### Requirement: Transactions Rail Is A Live Progressive List

The Transactions rail is a **live** list. Rendered rows MUST be appended and MUST NOT be
unmounted as the list grows, so the scrollbar grows honestly with the loaded content. The rail
MUST NOT use windowing, virtualization, or any render-phase window reset. It MUST reconcile its
own visible window under three invariants: the window stays stable across refreshes, a
fully-revealed list stays fully revealed, and the selected row stays rendered. The next batch
MUST be requested as the next backend cursor page when the user scrolls near the bottom.

#### Scenario: The first render shows exactly one batch
- GIVEN the backend returns more transactions than one render batch
- WHEN the rail first renders
- THEN the number of rendered transaction rows MUST equal the batch size

#### Scenario: Scrolling near the bottom appends the next cursor page
- GIVEN a rendered batch and a next-page cursor
- WHEN the user scrolls near the bottom of the rail
- THEN the next cursor page MUST be requested and appended below the existing rows
- AND no already-rendered row MUST be unmounted

#### Scenario: An incoming capture push does not reset the visible window
- GIVEN the user has revealed several batches beyond the first
- WHEN an arrival or terminal capture delta is pushed
- THEN the visible window MUST NOT shrink back to the first batch
- AND the selected row, the active filters, and the scroll position MUST be preserved
