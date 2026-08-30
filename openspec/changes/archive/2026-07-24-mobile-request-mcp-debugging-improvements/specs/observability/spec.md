# Delta for observability

## MODIFIED Requirements

### Requirement: Sanitization and Privacy Are Default-Deny

The system MUST store only a sanctioned sanitized subset of request data defined by bridge policy/configuration. It MUST NOT persist auth tokens, `Authorization` headers, raw sensitive headers, or unrestricted raw request bodies. This sanitization policy MUST also apply to the additive response body, request header, and response header capture: response bodies MUST be sanitized before persistence, and captured request/response headers MUST exclude `Authorization` and any other configured sensitive header name, persisting only a sanctioned sanitized JSON subset.

#### Scenario: Sensitive request material is excluded
- GIVEN an authenticated mobile request carries bearer credentials and additional headers
- WHEN the capture record is persisted
- THEN forbidden secrets and raw sensitive headers are absent from storage
- AND only the sanctioned sanitized subset may remain

#### Scenario: Response body is sanitized before persistence
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile fails and returns an error response body
- WHEN the response body is captured
- THEN the persisted `response_body` contains only the sanctioned sanitized subset
- AND it MUST NOT contain forbidden secrets or unrestricted raw payload content

#### Scenario: Request and response headers exclude auth material
- GIVEN a mobile request carries an `Authorization` header and other request/response headers
- WHEN `request_headers` and `response_headers` are captured
- THEN the `Authorization` header and any other configured sensitive header are absent from the persisted JSON
- AND only sanctioned header names/values remain

### Requirement: Retention and Degradation Are Owned by Observability Policy

The system MUST manage captured-mobile-request retention separately from `anime_snapshots` through bridge-owned policy/configuration with safe defaults. Retention pruning, storage unavailability, or malformed capture rows MUST degrade observability only and MUST NOT block or alter canonical PATCH/reconcile behavior. This guarantee extends to failures or omissions while capturing the additive `response_body`, `request_headers`, `response_headers`, and `duration_ms` fields: any failure to capture, sanitize, or persist these fields MUST NOT block, delay, or alter the canonical response returned to the mobile client.

#### Scenario: Retention operates on auxiliary rows only
- GIVEN captured mobile requests have aged past the configured or default retention policy
- WHEN retention pruning runs
- THEN only auxiliary capture rows are eligible for removal
- AND canonical anime-state rows remain untouched

#### Scenario: Observability degradation does not change mobile semantics
- GIVEN capture storage is unavailable or a stored capture row is malformed
- WHEN a canonical mobile PATCH or reconcile flow executes
- THEN the mobile protocol and canonical response stay unchanged
- AND observability reports degradation through warning/error paths only

#### Scenario: Response body or header capture failure does not block the canonical flow
- GIVEN capturing the response body, request headers, or response headers for a request fails or the sanitizer rejects the payload
- WHEN a canonical mobile PATCH or reconcile flow executes
- THEN the canonical response to the mobile client is unaffected
- AND the capture record is persisted with the affected optional field left null, or the capture write is skipped, without surfacing an error to the mobile client

## ADDED Requirements

### Requirement: Additive Capture Schema for Response, Header, and Duration Telemetry

The system MUST extend the existing captured-mobile-request schema with additive, nullable-by-default columns: `response_body` (text, nullable), `request_headers` (JSON, sanitized, nullable), `response_headers` (JSON, sanitized, nullable), and `duration_ms` (integer, nullable). Existing rows captured before this change MUST remain valid and readable with these columns absent or null. The system MUST add indexes supporting `route + captured_at_ms`, `http_status + captured_at_ms`, and `anime_id + captured_at_ms` query patterns, and MUST support correlation lookup by `changelog_id` through the existing correlation table.

#### Scenario: Additive columns default to null for historical rows
- GIVEN a captured mobile request row was written before this change
- WHEN that row is read after the schema migration
- THEN `response_body`, `request_headers`, `response_headers`, and `duration_ms` are absent or null
- AND the row is still returned as well-formed by search and context tools

#### Scenario: New captures populate the additive columns when available
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile completes after this change
- WHEN the capture record is written
- THEN `duration_ms` is recorded for the request
- AND `response_body`, `request_headers`, and `response_headers` are recorded when captured and sanitized successfully

#### Scenario: Indexed query patterns remain performant at scale
- GIVEN a large volume of captured mobile requests spanning many routes, statuses, and anime IDs
- WHEN a query filters by route and time, HTTP status and time, or anime ID and time
- THEN the query uses the corresponding index
- AND the capture schema migration is purely additive, requiring no destructive rewrite of existing rows

### Requirement: Response Body Capture Is Scoped to Failed Requests

The system MUST capture and sanitize `response_body` for failed mobile PATCH, REST reconcile, and WebSocket reconcile requests. The system MAY omit response body capture for successful responses by default to limit storage growth and PII exposure surface.

#### Scenario: Failed request captures the sanitized response body
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile returns a validation or error response
- WHEN the capture record is written
- THEN `response_body` contains the sanitized bridge error/validation message
- AND it is retrievable via `get_mobile_request_context`

#### Scenario: Successful request may omit response body by default
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile succeeds
- WHEN the capture record is written
- THEN `response_body` MAY be null
- AND the omission MUST NOT be treated as a malformed row
