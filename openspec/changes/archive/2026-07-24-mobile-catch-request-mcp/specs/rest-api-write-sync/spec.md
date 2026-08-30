# Delta for rest-api-write-sync

## ADDED Requirements

### Requirement: Authenticated REST Writes Capture Sanitized Mobile Requests

The system MUST attempt auxiliary captured-mobile-request persistence for authenticated `PATCH /api/animes/:id` and `POST /api/sync/reconcile` after authentication succeeds. Each capture MUST record only sanctioned sanitized request metadata and the canonical outcome classification (`accepted`, `rejected`, or `malformed`) without changing the existing HTTP contract.

#### Scenario: Accepted PATCH is captured without changing behavior
- GIVEN a valid bearer token and a valid PATCH body
- WHEN `PATCH /api/animes/:id` is accepted
- THEN the system returns the same canonical success response as today
- AND one sanitized captured mobile request is persisted with outcome `accepted`

#### Scenario: Rejected authenticated PATCH is still captured
- GIVEN a valid bearer token and a semantically invalid PATCH body
- WHEN `PATCH /api/animes/:id` is rejected by existing validation or not-found rules
- THEN the system returns the same canonical rejection status as today
- AND one sanitized captured mobile request is persisted with outcome `rejected`

#### Scenario: Malformed authenticated PATCH is captured safely
- GIVEN a valid bearer token and a malformed PATCH body
- WHEN decode fails before canonical patch application
- THEN the system returns the same canonical `400 Bad Request` as today
- AND one sanitized captured mobile request is persisted with outcome `malformed`

#### Scenario: Accepted reconcile is captured without changing behavior
- GIVEN a valid bearer token and a reconcile body accepted by current rules
- WHEN `POST /api/sync/reconcile` completes
- THEN the system returns the same canonical reconcile status and response body as today
- AND one sanitized captured mobile request is persisted with outcome `accepted`

#### Scenario: Rejected reconcile is still captured
- GIVEN a valid bearer token and a reconcile body rejected by current validation rules
- WHEN `POST /api/sync/reconcile` fails canonically
- THEN the system returns the same canonical rejection status as today
- AND one sanitized captured mobile request is persisted with outcome `rejected`

#### Scenario: Malformed authenticated reconcile request is captured safely
- GIVEN a valid bearer token and a malformed reconcile body
- WHEN decode fails before canonical reconcile processing
- THEN the system returns the same canonical `400 Bad Request` as today
- AND one sanitized captured mobile request is persisted with outcome `malformed`

#### Scenario: Capture-store failure does not block canonical REST behavior
- GIVEN an authenticated PATCH or REST reconcile would otherwise complete canonically
- WHEN auxiliary capture persistence fails
- THEN the canonical handler keeps its existing status code and response body
- AND the failure is treated as observability degradation only
