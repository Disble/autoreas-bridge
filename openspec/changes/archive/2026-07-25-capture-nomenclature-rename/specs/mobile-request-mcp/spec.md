# Delta for mobile-request-mcp

> Capability identifier note: the capability is still keyed `mobile-request-mcp` because it has
> no promoted `openspec/specs/mobile-request-mcp/spec.md` yet and two un-archived change folders
> reference it. Renaming the capability identifier is deferred to archive time (see the
> proposal's Out of Scope). Only the runtime tool contract changes here.

## MODIFIED Requirements

### Requirement: Local Stdio Sidecar Surface

The system MUST expose this capability through a separate local stdio sidecar. It MUST register exactly four tools, named without a transport prefix: `search_requests`, `get_request_context`, `resolve_request_context`, and `summary_requests`. The tool-name validator MUST accept exactly these four names and reject every other name, including the previously-registered names. It MUST NOT expose mutation/replay tools, MCP resources/templates, remote transport, or mobile-protocol replacement.
(Previously: the sidecar registered `resolve_mobile_request_context`, `search_mobile_requests`, `get_mobile_request_context`, and `summary_mobile_requests`. The capture pipeline records all bridge request traffic, not only mobile traffic, so the `mobile` qualifier misdescribed the tools.)

#### Scenario: Sidecar exposes the bounded, transport-neutral tool surface

- GIVEN the bridge SQLite database and a supported capture schema are available
- WHEN a local MCP client initializes the sidecar
- THEN the sidecar exposes exactly the 4 tools `search_requests`, `get_request_context`, `resolve_request_context`, `summary_requests`
- AND no other tool can mutate bridge state

#### Scenario: Previously-registered tool names are rejected

- GIVEN a client invokes a tool named `search_mobile_requests`, `get_mobile_request_context`, `resolve_mobile_request_context`, or `summary_mobile_requests`
- WHEN the sidecar validates the tool name
- THEN it MUST reject the call as unsupported
- AND it MUST NOT silently alias the name to a current tool

#### Scenario: Missing capture schema fails closed

- GIVEN the bridge database file is missing, or neither capture table generation is present
- WHEN the sidecar starts or a tool is invoked
- THEN the system MUST fail closed with an unavailable/schema-mismatch error
- AND it MUST NOT fabricate empty success results

### Requirement: Search Pagination and Result Shape

`search_requests` MUST search only sanctioned sanitized capture fields and MUST return newest-first summaries. Each summary MUST expose the request kind and the authenticated device identity, when one is present, for the captured request. The tool MUST apply a safe default limit, MUST clamp oversized limits to an implementation-defined safe maximum, and MUST return the applied limit plus continuation metadata.
(Previously named `search_mobile_requests`; the pagination, filtering, and result shape are unchanged.)

#### Scenario: Search uses safe defaults

- GIVEN matching captured requests exist
- WHEN the client omits pagination inputs
- THEN the tool returns the first page in newest-first order
- AND the response includes the applied limit and next-page metadata

#### Scenario: Oversized page request is bounded

- GIVEN the client requests a page larger than the safe maximum
- WHEN `search_requests` executes
- THEN the tool clamps the page to the safe maximum
- AND the response reports the bounded limit actually used

### Requirement: Context Resolution and Retrieval

`resolve_request_context` MUST accept an imprecise reference and return zero or more candidate request identifiers with disambiguating metadata. `get_request_context` MUST return one full sanitized captured request — including its request kind, authenticated device identity, outcome, and any available effect correlations — for an exact identifier.
(Previously named `resolve_mobile_request_context` and `get_mobile_request_context`; ranking, sanitization, and result shapes are unchanged.)

#### Scenario: Ambiguous reference resolves to candidates

- GIVEN multiple captured requests match one natural-language reference
- WHEN the client calls `resolve_request_context`
- THEN the tool returns candidate request identifiers
- AND each candidate includes enough metadata to choose the intended record

#### Scenario: Exact context retrieval handles misses

- GIVEN no captured request exists for the requested identifier
- WHEN the client calls `get_request_context`
- THEN the tool returns a not-found result
- AND it MUST NOT return data from a different request

### Requirement: Aggregated Request Health Summary

`summary_requests` MUST aggregate captured requests into per-route, per-status, and per-outcome counts with bounded recent-error samples, scoped by the same optional filters `search_requests` accepts, and MUST never mutate bridge state.
(Previously named `summary_mobile_requests`; the aggregation, filter set, and sample bounds are unchanged.)

#### Scenario: Summary aggregates without mutation

- GIVEN captured requests exist
- WHEN the client calls `summary_requests`
- THEN the tool returns grouped counts and bounded error samples
- AND bridge-owned row counts remain unchanged

## ADDED Requirements

### Requirement: Sidecar Reads Both Capture Table Generations

The sidecar MUST open and serve a bridge database whose capture tables carry either the transport-neutral names or the previously-used names, and MUST accept capture schema versions `1`, `2`, and `3`. A recognizable older database MUST NOT be rejected merely because it has not been migrated yet.

#### Scenario: Sidecar serves an un-migrated database

- GIVEN a bridge database whose capture tables still use the previous names at schema version `2`
- WHEN the sidecar starts and a client calls any of the four tools
- THEN the sidecar MUST open the database successfully
- AND the tool MUST return the same results those rows produce on a migrated database

#### Scenario: Sidecar serves a migrated database

- GIVEN a bridge database whose capture tables use the transport-neutral names at schema version `3`
- WHEN the sidecar starts and a client calls any of the four tools
- THEN the sidecar MUST open the database successfully and query the transport-neutral tables

### Requirement: Tool Rename Is Announced As Breaking

Renaming the tool surface is a breaking change to the MCP client contract. The change MUST update the repository's MCP client registration to the renamed sidecar binary in the same change, and MUST announce the removed tool names and the renamed capture tables in the project's consumer-facing documentation.

#### Scenario: Breaking rename is announced

- GIVEN the tool names and sidecar binary are renamed
- WHEN the change is delivered
- THEN the repository MCP client registration MUST reference the renamed binary
- AND the consumer-facing API/observability documentation MUST record the removed tool names, the new tool names, the capture table rename, and the capture schema version bump
