# Delta for Activity Network Transactions

## ADDED Requirements

### Requirement: Pending Capture Row On Request Arrival

The capture pipeline MUST write a pending capture row the moment a request begins (arrival), before the handler or message pump completes, and MUST later upsert that same row to its terminal state keyed on `request_id` (the schema's primary key), never creating a second row for the same request.

#### Scenario: Arrival row exists before completion
- GIVEN a request reaches the capture middleware or WebSocket pump
- WHEN the arrival is recorded
- THEN a capture row with `request_id` MUST exist in `mobile_request_captures` with a pending state, before the handler finishes processing

#### Scenario: Terminal upsert reuses the same row
- GIVEN a pending row was written on arrival for a given `request_id`
- WHEN the handler or pump completes and the terminal capture is recorded
- THEN the existing row for that `request_id` MUST be upserted to its terminal state (status, duration, semantic facts)
- AND no additional row MUST be created for that `request_id`

### Requirement: Real-Time Push Of Capture Changes

The bridge MUST push capture arrival and terminal deltas to the frontend in real time via the Wails runtime event mechanism, MUST NOT rely on frontend polling for this purpose, and the Activity view MUST merge those deltas into the transaction list in place without resetting selection or scroll position.

#### Scenario: In-flight request appears before completion
- GIVEN the Activity view is mounted and a new request arrives at the bridge
- WHEN the arrival capture row is written
- THEN a runtime event MUST be emitted to the frontend
- AND the request MUST appear in the Activity transaction list in a pending/in-flight state before it completes

#### Scenario: Pending row transitions in place on completion
- GIVEN a pending row is already visible in the Activity transaction list
- WHEN the request completes and the terminal capture event is emitted
- THEN that same row MUST update in place to show its terminal status and duration
- AND the currently selected row and scroll position MUST NOT be lost or reset

### Requirement: Live Elapsed Indicator For Pending Rows

The Activity view MUST show a live elapsed-time indicator for each pending (in-flight) transaction row that advances while the request is outstanding, and MUST stop advancing once no pending rows remain.

#### Scenario: Elapsed indicator advances during an in-flight request
- GIVEN a pending transaction row is visible in the Activity list
- WHEN time passes before that request completes
- THEN the elapsed indicator for that row MUST visibly advance

#### Scenario: Elapsed indicator stops when nothing is pending
- GIVEN all previously pending transactions have transitioned to a terminal state
- WHEN the Activity view has no pending rows left
- THEN the live elapsed clock MUST stop ticking

## MODIFIED Requirements

### Requirement: Transaction List View

The Activity route MUST render captured transactions as a DevTools-Network-tab-style table with columns for method/kind, route, HTTP status (colored by class), duration, and time, and MUST support row selection. Rows for in-flight requests MUST render in a pending state and MUST update live as arrival and terminal capture events are pushed from the bridge, without requiring a manual refresh or losing the current selection.
(Previously: the table only rendered transactions returned by an on-demand read binding, with no live/in-flight row state and no push-driven updates.)

#### Scenario: Transactions render with real status/duration
- GIVEN captured transactions with populated `http_status` and `duration_ms`
- WHEN the Activity route loads
- THEN the table MUST show the real status code and duration per row, not a placeholder dash

#### Scenario: Empty, loading, and error states
- GIVEN the transaction list is loading, empty, or failed
- WHEN the Activity route renders
- THEN it MUST show a distinct loading, empty, or error state instead of a blank or stale table

#### Scenario: Row selection opens detail
- GIVEN the transaction table is populated
- WHEN a user selects a row
- THEN the detail inspector MUST show that transaction's data

#### Scenario: Live rows update without manual refresh
- GIVEN the Activity route is mounted and showing existing transactions
- WHEN a new request arrives or an in-flight request completes
- THEN the table MUST reflect that arrival or completion without the user triggering a manual refresh
- AND the currently selected row (if any) MUST remain selected

## Non-Functional Constraints

- The frontend live-merge path MUST remain read-only: it MUST NOT write to `mobile_request_captures` or attempt to unmask/re-derive sanitized capture fields.
- Capture writes (arrival and terminal) MUST NOT block or fail the canonical request/response or WebSocket message flow they observe.
- Runtime event field names for capture deltas MUST use English wire naming, consistent with existing capture record fields.
