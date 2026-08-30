# Activity Runtime Events Specification

## Purpose

Defines the Runtime Events surface inside Activity as a read path over the **persisted**
runtime-event store rather than the in-process ring buffer, so a human answers in the desktop
UI the same questions the request-capture MCP's `search_events` answers for an agent —
durably, across restarts, over the whole retention window.

> **Parity scope.** SDD-65 claims parity on **6 of the MCP's 7 tools**.
> `get_correlation_timeline` is a stated exclusion, recorded in
> `activity-observability-overview`. `GetRecentLogs()` and the in-memory ring buffer are
> retained unchanged; this capability simply stops being their consumer.

## Requirements

### Requirement: Persisted Runtime Event Read Binding

The bridge `App` MUST expose a read-only, Wails-bound method that searches the persisted
runtime-event store through the app's own database handle. The query MUST accept `domain`,
`level`, `event_type`, `correlation_id`, `entity_id`, free text over message/domain/event
type, `start_ms`, `end_ms`, a page limit, and a continuation cursor. Every populated field
MUST compose with the others as a conjunction. Results MUST be newest-first and MUST carry
the applied limit and a next-page cursor. The method MUST NOT write to any table and MUST
NOT open a second SQLite connection or process.

#### Scenario: The desktop surface and the MCP agree
- GIVEN persisted runtime events exist
- WHEN the binding is called with a filter set `search_events` also accepts
- THEN it MUST return the same events in the same newest-first order that `search_events` returns for those filters

#### Scenario: Events survive an application restart
- GIVEN runtime events were persisted before the bridge process stopped
- WHEN the bridge restarts and the Runtime Events surface loads its first page
- THEN those events MUST render with their domain, level, message, timestamp, correlation id, entity id, and event type intact
- AND the visible history MUST NOT be limited to entries recorded since the current process started

#### Scenario: Populated filters compose as a conjunction
- GIVEN persisted events span multiple domains, levels, and event types
- WHEN a domain, a level, and a time window are supplied together
- THEN only events matching all three MUST be returned

#### Scenario: No match is an empty page, not an error
- GIVEN no persisted event matches the supplied filters
- WHEN the binding executes
- THEN it MUST return an empty page with valid pagination metadata
- AND it MUST NOT error, panic, or fabricate rows

### Requirement: The Surface Discloses What It Cannot Show

The Runtime Events surface MUST report the persisted-event store's availability instead of
presenting an empty successful result when that store is absent or unreachable, and MUST
disclose that `debug`-level events are not persisted under the shipped default policy. It
MUST NOT present either absence as a measured "nothing happened".

#### Scenario: Unavailable event store degrades visibly
- GIVEN the bridge database has no persisted-event table, or that table is unreachable
- WHEN the Runtime Events surface loads
- THEN it MUST render a degraded state naming the reason
- AND it MUST NOT render an ordinary empty list implying no events occurred

#### Scenario: Debug absence is stated, not implied
- GIVEN the shipped default policy excludes `debug`-level events from persistence
- WHEN the Runtime Events surface renders
- THEN it MUST state that debug-level events are not persisted under the current policy

### Requirement: Domain Filter Options Are Derived From The Data

The domain filter MUST derive its options from the domains actually present in the persisted
event store. It MUST NOT read them from a hardcoded constant list. Every domain present in
the data MUST be offerable, alongside the "all domains" sentinel.

#### Scenario: A domain absent from the previous hardcoded list is offerable
- GIVEN the persisted store holds events in a domain the previous hardcoded option list did not contain
- WHEN the domain filter renders
- THEN that domain MUST appear as a selectable option

#### Scenario: Selecting a derived domain filters the whole store
- GIVEN the domain filter offers a domain derived from the data
- WHEN a user selects it
- THEN only events in that domain MUST be returned, including matches outside the currently loaded page

#### Scenario: An empty store offers only the sentinel
- GIVEN the persisted store holds no events
- WHEN the domain filter renders
- THEN it MUST offer the "all domains" sentinel and no fabricated domain names

### Requirement: Live Push Overlays The Persisted Page

Runtime events pushed during the session MUST be merged as an overlay on top of the persisted
page. A pushed event MUST NOT cause the loaded page to be replaced, re-fetched from the first
page, or reordered, and MUST NOT be shown when it does not match the active filters. Selection
and scroll position MUST survive the merge.

#### Scenario: A pushed event is added without replacing the page
- GIVEN the surface shows a persisted page and the user has scrolled and selected a row
- WHEN a new runtime event is pushed during the session
- THEN the event MUST appear in the feed
- AND the already-rendered persisted entries MUST remain present and ordered
- AND the selected row and scroll position MUST NOT be reset

#### Scenario: A pushed event outside the active filter is not injected
- GIVEN a domain filter is active
- WHEN an event in a different domain is pushed
- THEN it MUST NOT be inserted into the filtered feed

### Requirement: Runtime Events Rail Is A Live Progressive List

The Runtime Events rail is a **live** list. Rendered rows MUST be appended and MUST NOT be
unmounted as the list grows, so the scrollbar grows honestly with the loaded content. The rail
MUST NOT use windowing, virtualization, or any render-phase window reset. It MUST reconcile its
own visible window under three invariants: the window stays stable across refreshes, a
fully-revealed list stays fully revealed, and the selected row stays rendered. The next batch
MUST be requested as the next backend cursor page when the user scrolls near the bottom.

#### Scenario: The first render shows exactly one batch
- GIVEN the persisted store returns more events than one render batch
- WHEN the rail first renders
- THEN the number of rendered event rows MUST equal the batch size

#### Scenario: Scrolling near the bottom appends the next cursor page
- GIVEN a rendered batch and a next-page cursor
- WHEN the user scrolls near the bottom of the rail
- THEN the next cursor page MUST be requested and appended below the existing rows
- AND no already-rendered row MUST be unmounted

#### Scenario: An incoming event does not reset the visible window
- GIVEN the user has revealed several batches beyond the first
- WHEN a live runtime event is pushed
- THEN the visible window MUST NOT shrink back to the first batch
- AND the active filter and the scroll position MUST be preserved

#### Scenario: Exhausted pagination stops requesting
- GIVEN the backend returned a page carrying no continuation cursor
- WHEN the user scrolls near the bottom again
- THEN no further page request MUST be issued

### Requirement: Correlation Trace Spans The Persisted Store

The Trace view for a selected event MUST resolve sibling events sharing its correlation id
from the persisted store rather than from the in-session buffer, so a correlation is
followable across application restarts.

#### Scenario: Trace follows a correlation id across a restart
- GIVEN events sharing one correlation id were persisted before a restart
- WHEN a user selects one of them after the restart and opens the Trace view
- THEN the sibling events sharing that correlation id MUST be listed in time order

#### Scenario: An event with no correlation id degrades cleanly
- GIVEN a selected event carries no correlation id
- WHEN the Trace view renders
- THEN it MUST show an explicit "no correlation" state
- AND it MUST NOT render an empty list implying siblings were lost
