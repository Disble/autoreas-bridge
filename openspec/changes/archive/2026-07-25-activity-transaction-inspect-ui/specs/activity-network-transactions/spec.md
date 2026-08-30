# Activity Network Transactions Specification (delta)

## Purpose

Delta over the `activity-network-transactions` capability introduced by `activity-devtools-network-view`. It adds the inspection affordances of the transaction view: coloured status and outcome pills in both the table and the detail header, an explicit refusal to fabricate an HTTP status for statusless rows, and request/response body panes rendered through the `shared-ui-code-block` primitive with honest not-captured and redacted states.

Unchanged requirements from the base capability (read binding, filtering, list view, selection, read-only sanitized data) are not restated here and remain in force.

## MODIFIED Requirements

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

## ADDED Requirements

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
