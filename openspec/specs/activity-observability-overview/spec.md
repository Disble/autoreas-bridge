# Activity Observability Overview Specification

## Purpose

Defines the aggregate surfaces inside Activity: captured-request health grouped by route,
status, and outcome, and runtime-event counts grouped by domain, level, and event type. These
are the desktop equivalents of the MCP's `summary_requests` and `summary_events`, so a human
can ask "which routes are failing, how often" and "what is this bridge actually doing" without
an agent.

> **Parity scope.** SDD-65 claims parity on **6 of the MCP's 7 tools**.
> `get_correlation_timeline` is deliberately excluded — see
> `Requirement: No Merged Request And Event Timeline`.

## Requirements

### Requirement: Request Health Summary Surface

The bridge MUST expose a read-only, Wails-bound aggregation over captured requests that groups
counts by route, HTTP status, and outcome, ordered by count descending, and attaches at most
five latest error samples per group. It MUST accept the same optional filters the transaction
list query accepts, and it MUST NOT mutate any bridge-owned table.

#### Scenario: Counts and bounded samples are returned
- GIVEN captured requests exist across several routes, statuses, and outcomes
- WHEN the overview surface loads
- THEN it MUST show one group per route/status/outcome combination with its count
- AND each group MUST carry at most five latest error samples

#### Scenario: Aggregation agrees with the MCP
- GIVEN a filter set both surfaces accept
- WHEN the overview aggregation and `summary_requests` run over the same data
- THEN the grouped counts MUST be identical

#### Scenario: Empty match is a zeroed result, not an error
- GIVEN no captured request matches the active filters
- WHEN the surface renders
- THEN it MUST show a zeroed/empty aggregation
- AND it MUST NOT fail or fabricate groups

### Requirement: Runtime Event Summary Surface

The bridge MUST expose a read-only, Wails-bound aggregation over persisted runtime events that
produces independent counts by domain, by level, and by event type, plus at most five newest
matching samples, scoped by the runtime-event filter set defined in `activity-runtime-events`.
The surface MUST honour the persisted-event availability signal.

#### Scenario: Three independent groupings render
- GIVEN persisted runtime events span multiple domains, levels, and event types
- WHEN the overview surface loads
- THEN it MUST show counts by domain, by level, and by event type
- AND it MUST show at most five newest samples

#### Scenario: Unavailable event store is reported, not silently zeroed
- GIVEN the persisted-event store is absent or unreachable
- WHEN the event summary renders
- THEN the surface MUST report the degraded availability
- AND it MUST NOT present zero counts as a measured result

#### Scenario: Empty match is a zeroed aggregation
- GIVEN no persisted event matches the active filters
- WHEN the event summary executes
- THEN it MUST return a zeroed aggregation
- AND it MUST NOT fail or fabricate groups

### Requirement: No Merged Request And Event Timeline

The overview MUST NOT present a merged captured-request plus runtime-event correlation
timeline. The two stores are keyed on different values — the persisted events' correlation id
is a download-run id, while captured requests carry no correlation or run id in their
correlation envelope — so the request side of such a surface would be empty by construction.
Parity is therefore claimed on six of the MCP's seven tools, and `get_correlation_timeline` is
recorded as an explicit scope exclusion rather than an unnoticed gap.

#### Scenario: Correlation follow-through is event-side only
- GIVEN a correlation id present in the persisted event store
- WHEN a user follows that correlation from Activity
- THEN the surface MUST show the runtime events sharing it, per `activity-runtime-events`
- AND it MUST NOT present a request-side timeline claiming coverage it does not have

#### Scenario: The parity claim is stated as six of seven
- GIVEN the parity checklist over the MCP's seven tools
- WHEN parity is reported
- THEN six tools MUST each have a named Activity affordance
- AND `get_correlation_timeline` MUST be recorded as an explicit exclusion, not a miss

### Requirement: Overview Is A Surface Inside Activity

The overview MUST be reachable inside the existing Activity section without adding a new
application route or a new navigation entry.

#### Scenario: No new route or navigation entry appears
- GIVEN the overview surface ships
- WHEN the application's routes and navigation entries are inspected
- THEN no route or navigation entry MUST have been added for it
- AND the overview MUST still be reachable from within Activity
