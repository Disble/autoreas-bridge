# mobile-request-mcp Specification

## Purpose

Define a local read-only MCP sidecar that lets operators inspect sanitized **captured mobile requests** and their bridge-side effects without mutating bridge state.

## Requirements

### Requirement: Local Stdio Sidecar Surface

The system MUST expose this capability through a separate local stdio sidecar. It MUST register exactly three tools: `resolve_mobile_request_context`, `search_mobile_requests`, and `get_mobile_request_context`. It MUST NOT expose mutation/replay tools, MCP resources/templates, remote transport, or mobile-protocol replacement.

#### Scenario: Sidecar exposes the bounded tool surface
- GIVEN the bridge SQLite database and required capture schema are available
- WHEN a local MCP client initializes the sidecar
- THEN the sidecar exposes exactly the 3 named tools
- AND no other tool can mutate bridge state

#### Scenario: Missing database or schema fails closed
- GIVEN the bridge database file is missing or the required capture schema is absent
- WHEN the sidecar starts or a tool is invoked
- THEN the system MUST fail closed with an unavailable/schema-mismatch error
- AND it MUST NOT fabricate empty success results

### Requirement: Query-Only SQLite Reader

The system MUST open bridge SQLite in read-only, query-only mode for this sidecar. Tool execution MUST NOT mutate `anime_snapshots`, device/auth tables, capture tables, or any other bridge-owned state.

#### Scenario: Read-only inspection succeeds
- GIVEN captured mobile requests exist in bridge SQLite
- WHEN a client calls any of the 3 tools
- THEN the sidecar returns only read results
- AND bridge-owned row counts remain unchanged

#### Scenario: Mutation intent is rejected
- GIVEN a client attempts replay, delete, update, or any write-like action
- WHEN the action is routed to the sidecar
- THEN the system rejects it as unsupported
- AND no write-capable MCP surface is available

### Requirement: Search Pagination and Result Shape

`search_mobile_requests` MUST search only sanctioned sanitized capture fields and MUST return newest-first summaries. Each summary MUST expose the request kind and authenticated device identity for the captured request. The tool MUST apply a safe default limit, MUST clamp oversized limits to an implementation-defined safe maximum, and MUST return the applied limit plus continuation metadata.

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

### Requirement: Context Resolution and Retrieval

`resolve_mobile_request_context` MUST accept an imprecise reference and return zero or more candidate request identifiers with disambiguating metadata. `get_mobile_request_context` MUST return one full sanitized captured mobile request, including its request kind, authenticated device identity, outcome, and any available effect correlations for an exact identifier.

#### Scenario: Ambiguous reference resolves to candidates
- GIVEN multiple captured mobile requests match one natural-language reference
- WHEN the client calls `resolve_mobile_request_context`
- THEN the tool returns candidate request identifiers
- AND each candidate includes enough metadata to choose the intended record

#### Scenario: Exact context retrieval handles misses
- GIVEN no captured mobile request exists for the requested identifier
- WHEN the client calls `get_mobile_request_context`
- THEN the tool returns a not-found result
- AND it MUST NOT return data from a different request

### Requirement: Malformed Historical Rows Degrade Safely

The tools MUST skip malformed historical capture rows and continue serving well-formed rows. The response MUST surface that malformed rows were skipped through warning or count metadata.

#### Scenario: One malformed row does not poison the page
- GIVEN one malformed captured-request row and later well-formed rows exist
- WHEN a client searches or retrieves surrounding context
- THEN the well-formed rows are still returned
- AND the response indicates malformed rows were skipped
