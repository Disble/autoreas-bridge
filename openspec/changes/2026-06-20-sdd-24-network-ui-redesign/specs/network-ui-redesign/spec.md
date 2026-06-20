# Spec: Network UI redesign

## Requirement: Per-entry rows faithful to the observability feed

The Network table SHALL render one row per bridge log entry (NOT folded by
correlationId), surfacing the entry's message and level.

### Scenario: a domain event renders with its message and level
- **Given** a log entry `{ domain: "anime", level: "info", message: "publishing anime.changed for tracer-bullet-anime", eventType: "anime.publish" }` with no HTTP metadata
- **When** the Network table renders
- **Then** the row MUST show the message text, an `info` level tag, an `anime` domain tag, and MUST NOT show a fabricated HTTP "pending" status (STATUS shows `—`).

### Scenario: an HTTP request renders as METHOD + path
- **Given** an entry `{ eventType: "http.request", durationMs: 82, metadata: { method: "GET", path: "/api/status", status: 200 } }`
- **When** the table renders
- **Then** MESSAGE MUST read `GET /api/status`, STATUS MUST read `200`, DURATION MUST read `82ms`.

## Requirement: Domain and level use the shared palette

Domain and level tags SHALL use the same color mapping as the ObservabilityPanel.

### Scenario: level colors
- **Given** entries with levels info, debug, warn, error
- **When** rendered
- **Then** each level tag MUST use the project's corresponding tone (info→success, debug→accent, warn→warning, error→danger).

## Requirement: Detail inspector shows full entry, metadata, and trace

Selecting a row SHALL open an inspector with the entry's fields, a metadata
key-value table, and a correlation trace.

### Scenario: metadata is fully shown
- **Given** a selected entry with `metadata: { eventName: "anime.changed", event: "bus.publish" }`
- **When** the inspector renders
- **Then** it MUST list every metadata key with its stringified value.

### Scenario: correlated trace
- **Given** a selected entry with `correlationId: "corr-1"` and other entries sharing `corr-1`
- **When** the inspector renders
- **Then** the Trace section MUST list those sibling entries in time order; **and** when the entry has no correlationId the Trace section MUST be omitted (no empty section).

## Requirement: Filtering by text and level

The view SHALL filter by free text (message/domain/eventType/path) and by level.

### Scenario: level filter
- **Given** entries of mixed levels
- **When** the level filter is set to `error`
- **Then** only `error` rows MUST remain; setting it to `all` MUST restore every row.

### Scenario: text filter
- **Given** entries with various messages
- **When** the query is `sync`
- **Then** only rows whose message/domain/eventType/path contains `sync` (case-insensitive) MUST remain.

### Scenario: domain filter pill
- **Given** entries from domains `anime`, `sync`, `api`
- **When** the `sync` domain filter pill is active
- **Then** only `sync` rows MUST remain; the `All` pill MUST restore every row.

## Requirement: DevTools-style tabbed inspector

The detail inspector SHALL present the selected entry across tabs (General,
Metadata, Trace) and allow deselection.

### Scenario: tabs
- **Given** a selected entry with metadata and a correlationId
- **When** the inspector renders
- **Then** it MUST show tabs General / Metadata / Trace, defaulting to General; the Trace tab MUST be absent when the entry has no correlationId.

### Scenario: deselect
- **Given** a selected entry
- **When** the inspector's close (×) control is activated
- **Then** the inspector MUST return to the empty prompt and no row MUST be selected.

## Requirement: Network supersedes the dedicated Logs section

The Network view SHALL be the single dedicated surface for bridge log/operation
activity; the standalone `/observability` "Logs" section SHALL be removed.

### Scenario: Logs nav entry removed
- **Given** the app shell
- **When** the primary navigation renders
- **Then** there MUST NOT be a "Logs" / `/observability` entry, and navigating to `/observability` MUST fall through to the not-found route.
