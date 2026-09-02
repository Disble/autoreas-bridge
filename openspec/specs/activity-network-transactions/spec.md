# Activity Network Transactions Specification

## Purpose

Defines the in-process read path and frontend DevTools-style Network view over captured HTTP transactions stored in `mobile_request_captures`, replacing the mislabeled event-log-as-Network-tab behavior in Activity.

> **Drift note — recorded 2026-08-30 by SDD-65 Slice 0.** This capability's original text
> names the capture storage `mobile_request_captures` and its reader `mobilecapture.Reader`.
> `capture-nomenclature-rename` (commit `cc0504b`, 2026-07-25) renamed the canonical table to
> `request_captures` and moved the reader to `internal/observability/requestcapture`;
> `mobile_request_captures` survives only as the tolerated legacy read generation
> (`internal/observability/requestcapture/reader.go:39-52`). That change shipped no delta for
> this capability, so the old names below are historical, not authoritative. The bindings are
> `App.ListCaptureTransactions` and `App.GetCaptureTransaction` (`internal/desktop/app_captures.go`).

## Requirements

### Requirement: In-Process Transaction Read Binding

The bridge `App` MUST expose a read-only, Wails-bound method that lists captured HTTP transactions from the app's own DB handle via `mobilecapture.Reader`, and a second read-only method that fetches one transaction by request ID. Neither method MUST mutate `mobile_request_captures` or open a second SQLite connection/process.

#### Scenario: Frontend lists transactions
- GIVEN the bridge app is running with an open DB handle
- WHEN the frontend calls the list-transactions binding with filters and a page size
- THEN the method MUST return a newest-first page of transactions plus pagination metadata
- AND the method MUST NOT write to the database

#### Scenario: Frontend fetches one transaction detail
- GIVEN a captured transaction exists with a known request ID
- WHEN the frontend calls the get-transaction binding with that ID
- THEN the method MUST return the full record including headers, body, duration, and correlations

#### Scenario: Older schema degrades safely
- GIVEN the open DB predates the version-2 telemetry columns (`response_body`, `request_headers`, `response_headers`, `duration_ms`)
- WHEN the list or get binding is called
- THEN the method MUST still return transactions with those optional fields omitted
- AND the method MUST NOT error or panic due to missing columns

#### Scenario: Capture store unavailable
- GIVEN the capture database or table is unreachable
- WHEN the list or get binding is called
- THEN the method MUST return a structured, non-panicking error the frontend can render as an empty/error state

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

### Requirement: Transaction List View

The Activity route MUST render captured transactions as a DevTools-Network-tab-style table with columns for method/kind, route, **outcome**, HTTP status, duration, and time, and MUST support row selection. The **outcome** and **status** columns MUST both render as colour-coded pills built on the project's badge primitive with semantic colour tokens — never with hardcoded hex/oklch values and never with styling ported from an external project.

#### Scenario: Transactions render with real status/duration
- GIVEN captured transactions with populated `httpStatus` and `durationMs`
- WHEN the Activity route loads
- THEN the table MUST show the real status code and duration per row, not a placeholder dash

#### Scenario: Outcome renders as a coloured pill
- GIVEN a captured transaction whose outcome is `rejected`
- WHEN the row renders
- THEN the outcome MUST render as a pill using the danger semantic token
- AND it MUST be visually distinguishable from an `accepted` row's outcome pill

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

### Requirement: Transaction Detail Inspector

The detail inspector MUST present, for the selected transaction: a general pane (method, route, status, duration, device, anime, correlation), a request pane (headers plus payload), and a response pane (headers plus body), all populated from already-sanitized capture fields. The request payload and the response body MUST be rendered through the shared code-block primitive rather than a hand-rolled preformatted block, and the detail header MUST carry the same status and outcome pills as the table row.

#### Scenario: Full transaction detail
- GIVEN a selected transaction has body and header data captured
- WHEN the detail inspector renders
- THEN it MUST show the general, request, and response panes with that data
- AND the request payload and response body MUST each be rendered by the shared code-block primitive

#### Scenario: Detail header pills match the row
- GIVEN a transaction rendered in the table with a given status and outcome pill
- WHEN that transaction is selected and the detail header renders
- THEN the detail header MUST show a status pill and an outcome pill with the same labels and the same semantic colours as the table row
- AND both MUST be resolved by the same shared mapping rather than a duplicated one

#### Scenario: Missing optional telemetry
- GIVEN a selected transaction predates the optional telemetry columns
- WHEN the detail inspector renders
- THEN the body/header panes MUST show an explicit "not captured" state instead of erroring

### Requirement: Read-Only Sanitized Data Only

The frontend MUST treat all capture fields as already sanitized by the backend and MUST NOT attempt to re-derive, unmask, or fetch raw request/response data by any other path.

#### Scenario: No raw secrets ever reach the UI
- GIVEN a captured request originally carried an auth header
- WHEN the detail inspector renders request headers
- THEN it MUST display only the sanitized value already stored by the capture pipeline

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

### Requirement: HTTP Status Pill Colour By Class

The status pill MUST derive its colour from the HTTP status class only, using semantic tokens: `2xx` MUST be the success token, `3xx` MUST be the neutral/default token, and both `4xx` and `5xx` MUST be the danger token. Any status outside those classes MUST fall back to the neutral/default token. The mapping MUST live in one pure helper consumed by every renderer.

#### Scenario: Success class
- GIVEN a transaction with `httpStatus` 200, 201, or 204
- WHEN its status pill renders
- THEN the pill MUST use the success token
- AND the label MUST be the literal status code

#### Scenario: Redirect class is neutral
- GIVEN a transaction with `httpStatus` 301 or 304
- WHEN its status pill renders
- THEN the pill MUST use the neutral/default token

#### Scenario: Client and server errors are both danger
- GIVEN one transaction with `httpStatus` 404 and another with `httpStatus` 500
- WHEN their status pills render
- THEN both MUST use the danger token

#### Scenario: Unexpected status class degrades neutrally
- GIVEN a transaction with an out-of-range `httpStatus` such as 100 or 999
- WHEN its status pill renders
- THEN the pill MUST use the neutral/default token
- AND the renderer MUST NOT throw

### Requirement: Outcome Pill Over The Real Capture Vocabulary

The outcome pill MUST cover the outcome vocabulary the capture pipeline actually writes and MUST map each value to a semantic token through one pure helper:

- request lifecycle: `pending` (in-flight arrival row), `accepted`, `rejected`, `malformed`;
- hub one-way frames: `opened` (`ws_connect`), `closed` (`ws_disconnect`), `pushed` (`ws_broadcast`).

The pill label MUST be the stored outcome value verbatim, so it stays consistent with the outcome filter field. Any value outside the known vocabulary MUST render with the neutral/default token rather than being dropped, coerced, or hidden.

#### Scenario: Terminal success outcomes
- GIVEN transactions whose outcome is `accepted` or `pushed`
- WHEN their outcome pills render
- THEN each MUST use the success token

#### Scenario: Failure outcome
- GIVEN a transaction whose outcome is `rejected`
- WHEN its outcome pill renders
- THEN it MUST use the danger token

#### Scenario: Malformed request is distinguishable from a rejection
- GIVEN a transaction whose outcome is `malformed`
- WHEN its outcome pill renders
- THEN it MUST use the warning token
- AND it MUST NOT use the same token as `rejected`

#### Scenario: In-flight and connection-open are active states
- GIVEN transactions whose outcome is `pending` or `opened`
- WHEN their outcome pills render
- THEN each MUST use the accent token

#### Scenario: Connection close is neutral
- GIVEN a transaction whose outcome is `closed`
- WHEN its outcome pill renders
- THEN it MUST use the neutral/default token

#### Scenario: Unknown outcome degrades neutrally
- GIVEN a captured transaction whose outcome is a value not in the known vocabulary
- WHEN its outcome pill renders
- THEN the pill MUST render the stored value verbatim with the neutral/default token
- AND the renderer MUST NOT throw or omit the row

### Requirement: Statusless Rows MUST NOT Fabricate An HTTP Status

A captured row that carries no `httpStatus` — every in-flight `pending` arrival row and every hub one-way `opened`/`closed`/`pushed` frame — MUST NOT render a status pill at all. The view MUST NOT substitute `0`, `200`, or any other placeholder code, and MUST NOT colour a missing status as if it were a success. The outcome pill is the sole carrier of meaning for such rows.

#### Scenario: In-flight row shows no status pill
- GIVEN a `pending` arrival row with no `httpStatus`
- WHEN the table row renders
- THEN no status pill MUST be rendered in the status cell
- AND the cell MUST show a neutral absence marker instead
- AND the outcome pill MUST show `pending`

#### Scenario: Hub one-way frame shows no status pill
- GIVEN a `ws_broadcast` row whose outcome is `pushed` and whose `httpStatus` is absent
- WHEN the table row and the detail header render
- THEN neither MUST render a status pill
- AND neither MUST display `0` or `200`

#### Scenario: A pending row that later completes gains its status
- GIVEN a `pending` row already rendered without a status pill
- WHEN its terminal capture row arrives over the runtime push and carries an `httpStatus`
- THEN the same row MUST then render the status pill for that code
- AND the outcome pill MUST update to the terminal outcome

### Requirement: Honest Request And Response Body Panes

> **Drift note — recorded 2026-08-30 by SDD-65 Slice 0.** This requirement's premise is
> obsolete. `7acb738` ("fix(activity): unify runtime diagnostics and request capture",
> 2026-07-25) made the capture pipeline preserve exact bodies and emit a real
> `captureState === 'truncated'` signal, and removed `CAPTURE_REDACTION_MARKER` /
> `TRANSACTION_RESPONSE_REDACTED_NOTICE` (an orphaned JSDoc block survives at
> `frontend/src/features/network/ui/TransactionPanel/transaction-panel.constants.ts:17-20`).
> Today `toTransactionBody` maps that signal to `state: 'redacted'` with
> `TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE`, which does state truncation
> (`transaction-panel.helpers.ts:117-118`). The three-state honesty guarantee still holds;
> the "MUST NOT claim truncation" ban does not, because the cause is now recoverable.

The request payload and response body panes MUST distinguish three states and MUST NOT conflate them: content that was captured, content that was never captured, and content the capture pipeline replaced with its redaction marker. The panes MUST NOT write a placeholder sentence into the body area itself.

Because the sanitizer records no truncation signal — a non-JSON body, a body over the sanitized size cap, and a body cut at the raw capture cap all collapse to the same marker — the UI MUST NOT claim that a body was truncated. It MUST describe the content as redacted by the capture pipeline and MUST allow for every possible cause.

#### Scenario: Captured body is inspectable
- GIVEN a selected transaction whose response body was captured as JSON
- WHEN the response pane renders
- THEN the body MUST be rendered by the shared code-block primitive with its Pretty/Raw switch and copy action available

#### Scenario: Absent response body is an explicit notice
- GIVEN a selected transaction with no captured response body
- WHEN the response pane renders
- THEN it MUST show an explicit "not captured" notice outside the body area
- AND it MUST NOT render the placeholder text inside a code area where it could be mistaken for the server's response
- AND it MUST NOT render an empty code area implying an empty body

#### Scenario: Successful responses legitimately have no body
- GIVEN a selected transaction whose status is in the 2xx class, for which the capture pipeline records no response body by design
- WHEN the response pane renders
- THEN the not-captured notice MUST convey that this absence is expected rather than a fault

#### Scenario: Redacted body is labelled as redacted
- GIVEN a selected transaction whose captured response body equals the capture pipeline's redaction marker
- WHEN the response pane renders
- THEN it MUST show a redaction notice attributing the content to the capture pipeline
- AND it MUST NOT present the marker as the origin's real response body
- AND the notice MUST NOT assert truncation as the cause

#### Scenario: Absent request payload is an explicit notice
- GIVEN a selected transaction whose captured payload carries no fields
- WHEN the request pane renders
- THEN it MUST show an explicit no-payload notice rather than an empty code area

#### Scenario: Request payload raw form is defined and copyable
- GIVEN a selected transaction whose payload is a captured object
- WHEN the request pane renders and the user copies it
- THEN the copied text MUST be the pane's declared raw form (the compact serialization of the captured payload), consistently in both the Pretty and Raw views

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

## Non-Functional Constraints

- The frontend live-merge path MUST remain read-only: it MUST NOT write to `mobile_request_captures` or attempt to unmask/re-derive sanitized capture fields.
- Capture writes (arrival and terminal) MUST NOT block or fail the canonical request/response or WebSocket message flow they observe.
- Runtime event field names for capture deltas MUST use English wire naming, consistent with existing capture record fields.

