# Activity Network Transactions Specification

## Purpose

Defines the in-process read path and frontend DevTools-style Network view over captured HTTP transactions stored in `mobile_request_captures`, replacing the mislabeled event-log-as-Network-tab behavior in Activity.

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

The read binding MUST accept filters for HTTP status class (2xx/4xx/5xx), method/kind, route substring, outcome, and a time window, composed as a conjunction.

#### Scenario: Filter by status class
- GIVEN transactions with mixed 2xx/4xx/5xx statuses exist
- WHEN the frontend requests only the 5xx class
- THEN only transactions whose `http_status` falls in 500-599 MUST be returned

#### Scenario: No matches
- GIVEN filters that match no stored transaction
- WHEN the list binding is called
- THEN it MUST return an empty page with valid pagination metadata, not an error

### Requirement: Transaction List View

The Activity route MUST render captured transactions as a DevTools-Network-tab-style table with columns for method/kind, route, HTTP status (colored by class), duration, and time, and MUST support row selection.

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

### Requirement: Transaction Detail Inspector

The detail inspector MUST present, for the selected transaction: a general pane (method, route, status, duration, device, anime, correlation), a request/response body pane, a request headers pane, and a response headers pane, all populated from already-sanitized capture fields.

#### Scenario: Full transaction detail
- GIVEN a selected transaction has body and header data captured
- WHEN the detail inspector renders
- THEN it MUST show the general, body, request-header, and response-header panes with that data

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
