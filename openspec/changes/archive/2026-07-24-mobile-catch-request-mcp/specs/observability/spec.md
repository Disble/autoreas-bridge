# Delta for observability

## ADDED Requirements

### Requirement: Captured Mobile Requests Are Auxiliary Observability Records

The system MUST persist captured mobile requests in auxiliary observability storage that is separate from canonical anime state. Every persisted capture record MUST include a normalized request kind, the authenticated device identity for that request, and the sanitized outcome classification. The capture record MUST preserve the trust boundary that Bridge SQLite owns anime state, while observability owns only sanitized request evidence and effect-correlation metadata.

#### Scenario: Capture links effects without becoming canonical state
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile causes bridge-side effects
- WHEN the capture record is written
- THEN the record may link device, changelog, conflict, or activity identifiers
- AND the record does not become an authority for anime state

#### Scenario: Kind and authenticated device identity are required without storing credentials
- GIVEN an authenticated mobile PATCH, REST reconcile, or WebSocket reconcile is captured
- WHEN the observability record is persisted
- THEN the record stores the request kind and authenticated device identity
- AND the record does not store auth credentials or raw authorization material

### Requirement: Sanitization and Privacy Are Default-Deny

The system MUST store only a sanctioned sanitized subset of request data defined by bridge policy/configuration. It MUST NOT persist auth tokens, `Authorization` headers, raw sensitive headers, or unrestricted raw request bodies.

#### Scenario: Sensitive request material is excluded
- GIVEN an authenticated mobile request carries bearer credentials and additional headers
- WHEN the capture record is persisted
- THEN forbidden secrets and raw sensitive headers are absent from storage
- AND only the sanctioned sanitized subset may remain

### Requirement: Retention and Degradation Are Owned by Observability Policy

The system MUST manage captured-mobile-request retention separately from `anime_snapshots` through bridge-owned policy/configuration with safe defaults. Retention pruning, storage unavailability, or malformed capture rows MUST degrade observability only and MUST NOT block or alter canonical PATCH/reconcile behavior.

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
