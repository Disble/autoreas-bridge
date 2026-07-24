# Delta for mobile-request-mcp

## MODIFIED Requirements

### Requirement: Search Pagination and Result Shape

`search_mobile_requests` MUST search only sanctioned sanitized capture fields and MUST return newest-first summaries. Each summary MUST expose the request kind and authenticated device identity for the captured request. The tool MUST apply a safe default limit, MUST clamp oversized limits to an implementation-defined safe maximum, and MUST return the applied limit plus continuation metadata. In addition, the tool MUST accept optional server-side filters — `route`, `status` (HTTP status code), `outcome`, `kind`, `device_id`, `anime_id`, `error_code`, `start_ms`, and `end_ms` — and MUST apply all supplied filters as a conjunction (AND) before pagination.

#### Scenario: Search uses safe defaults
- GIVEN matching captured mobile requests exist
- WHEN the client omits pagination inputs
- THEN the tool returns the first page in newest-first order
- AND the response includes the applied limit and next-page metadata

#### Scenario: Oversized page request is bounded
- GIVEN the client requests a page larger than the safe maximum
- WHEN `search_mobile_requests` executes
- THEN the tool clamps the page to the safe maximum
- AND the response reports the bounded limit actually used

#### Scenario: Route and status filters isolate a failing endpoint
- GIVEN captured requests exist for multiple routes and HTTP statuses
- WHEN the client calls `search_mobile_requests` with `route="/api/sync/reconcile"` and `status=400`
- THEN only captured requests matching both that route and that status are returned
- AND unrelated routes or statuses are excluded from the page

#### Scenario: Time window filter bounds results to a range
- GIVEN captured requests span a wide time range
- WHEN the client supplies `start_ms` and/or `end_ms`
- THEN only requests captured within the inclusive window are returned
- AND requests outside the window are excluded regardless of other filters

#### Scenario: Anime and error code filters combine with other filters
- GIVEN captured requests exist for several anime IDs and error codes
- WHEN the client supplies `anime_id` and `error_code` together with `route`
- THEN only requests matching all three filters are returned

#### Scenario: Unsupported filter combination returns an empty page, not an error
- GIVEN no captured request matches the combined filters
- WHEN `search_mobile_requests` executes
- THEN the tool returns an empty result page with valid pagination metadata
- AND it MUST NOT fail or fabricate matching rows

### Requirement: Context Resolution and Retrieval

`resolve_mobile_request_context` MUST accept an imprecise reference and return zero or more candidate request identifiers with disambiguating metadata, ranked by relevance to the reference. In addition to UUID-like fragments, `resolve_mobile_request_context` MUST understand references expressed as an HTTP status (e.g. "400"), a route fragment (e.g. "reconcile"), a relative or absolute time expression (e.g. "latest", "today"), and an anime identifier, and MUST combine multiple recognized reference components (for example, a status and a route together) when present in the same input. `get_mobile_request_context` MUST return one full sanitized captured mobile request, including its request kind, authenticated device identity, outcome, and any available effect correlations for an exact identifier, and MUST include `response_body`, `request_headers`, `response_headers`, and `duration_ms` when those fields were captured for that request.

#### Scenario: Ambiguous reference resolves to ranked candidates
- GIVEN multiple captured mobile requests match one natural-language reference
- WHEN the client calls `resolve_mobile_request_context`
- THEN the tool returns candidate request identifiers ordered by relevance to the reference
- AND each candidate includes enough metadata to choose the intended record

#### Scenario: Status-and-route reference resolves without an exact identifier
- GIVEN captured requests include failed reconcile calls
- WHEN the client calls `resolve_mobile_request_context` with a reference like `"latest reconcile 400"`
- THEN the tool interprets the status and route components together
- AND returns the most recent matching candidate(s) first

#### Scenario: Anime-scoped reference resolves to that anime's requests
- GIVEN captured requests exist for a specific anime ID
- WHEN the client calls `resolve_mobile_request_context` with a reference like `"reconcile for anime <id>"`
- THEN only candidates correlated to that anime ID are returned

#### Scenario: Exact context retrieval handles misses
- GIVEN no captured mobile request exists for the requested identifier
- WHEN the client calls `get_mobile_request_context`
- THEN the tool returns a not-found result
- AND it MUST NOT return data from a different request

#### Scenario: Context retrieval exposes response body, headers, and duration when captured
- GIVEN a captured request has a sanitized response body, sanitized request/response headers, and a recorded duration
- WHEN the client calls `get_mobile_request_context` for that identifier
- THEN the response includes `response_body`, `request_headers`, `response_headers`, and `duration_ms`

#### Scenario: Missing optional fields degrade safely
- GIVEN a captured request predates response body, header, or duration capture, or those fields were not captured for that request
- WHEN the client calls `get_mobile_request_context` for that identifier
- THEN the response omits or nulls the missing optional fields
- AND the tool still returns the remaining sanitized fields without error

## ADDED Requirements

### Requirement: Aggregated Request Health Summary

The system MUST expose a fourth read-only tool, `summary_mobile_requests`, that aggregates captured mobile requests into counts grouped by route, HTTP status, and outcome, plus a bounded number of latest error samples per group. The tool MUST accept the same optional filters as `search_mobile_requests` (route, status, outcome, kind, device_id, anime_id, error_code, start_ms, end_ms) to scope the aggregation, and MUST NOT mutate bridge state.

#### Scenario: Summary reports counts per route/status/outcome
- GIVEN captured requests exist across multiple routes, statuses, and outcomes
- WHEN the client calls `summary_mobile_requests` with no filters
- THEN the response includes counts grouped by route, HTTP status, and outcome
- AND the grouping reflects all matching captured requests

#### Scenario: Summary includes latest error samples per group
- GIVEN a route has multiple failed captured requests
- WHEN `summary_mobile_requests` executes
- THEN the response includes a bounded number of the most recent error samples for that route/status group
- AND each sample includes enough metadata to look up full context via `get_mobile_request_context`

#### Scenario: Summary scoped by filters narrows aggregation
- GIVEN the client supplies `route` and a time window
- WHEN `summary_mobile_requests` executes
- THEN only captured requests matching those filters contribute to the counts and error samples

#### Scenario: Empty result set returns zeroed aggregation, not an error
- GIVEN no captured request matches the supplied filters
- WHEN `summary_mobile_requests` executes
- THEN the tool returns an empty/zeroed aggregation result
- AND it MUST NOT fail or fabricate groups

### Requirement: Correlation Lookup by Changelog and Anime Identifier

The system MUST allow locating all captured mobile requests correlated to a given `changelog_id` or `anime_id` through `search_mobile_requests` filters, without requiring the caller to already know a request identifier.

#### Scenario: Changelog correlation surfaces all related requests
- GIVEN a changelog entry is linked to one or more captured mobile requests
- WHEN the client searches using that `changelog_id` as a correlation filter
- THEN all captured requests correlated to that changelog entry are returned

#### Scenario: Anime correlation surfaces all related requests
- GIVEN multiple captured requests are correlated to the same anime ID
- WHEN the client calls `search_mobile_requests` with that `anime_id`
- THEN all correlated requests are returned regardless of route or kind

### Requirement: Bounded Tool Surface Grows by Exactly One Tool

The system MUST expose exactly four tools after this change: `resolve_mobile_request_context`, `search_mobile_requests`, `get_mobile_request_context`, and `summary_mobile_requests`. It MUST NOT expose mutation/replay tools, MCP resources/templates, remote transport, or mobile-protocol replacement.

#### Scenario: Sidecar exposes the bounded four-tool surface
- GIVEN the bridge SQLite database and required capture schema (including the additive columns) are available
- WHEN a local MCP client initializes the sidecar
- THEN the sidecar exposes exactly the 4 named tools
- AND no other tool can mutate bridge state
