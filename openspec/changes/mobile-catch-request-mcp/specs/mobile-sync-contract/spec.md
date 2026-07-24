# Delta for mobile-sync-contract

## ADDED Requirements

### Requirement: WebSocket Reconcile Capture Preserves Protocol Compatibility

The system MUST treat authenticated WebSocket `reconcile` messages as captured mobile requests for observability. This capture MUST preserve the existing mobile message contract, MUST NOT add required client fields or new protocol steps, and MUST NOT change the canonical operation-application semantics of the existing handler.

#### Scenario: Authenticated reconcile message is captured and correlated
- GIVEN an authenticated WebSocket client sends a valid `reconcile` message
- WHEN the bridge applies pending operations and triggers reconcile
- THEN the message is persisted as one sanitized captured mobile request
- AND the capture links any available device, changelog, conflict, or activity correlations

#### Scenario: Rejected authenticated reconcile message is classified safely
- GIVEN an authenticated WebSocket client sends a `reconcile` message rejected by current pending-operation or reconcile rules
- WHEN the bridge rejects that message under the existing handler behavior
- THEN the existing WebSocket protocol behavior stays unchanged
- AND one sanitized captured mobile request is persisted with outcome `rejected`

#### Scenario: Non-reconcile websocket traffic is not reclassified
- GIVEN an authenticated WebSocket client sends `season_rating` or another non-reconcile message
- WHEN the bridge handles that message under current rules
- THEN the existing protocol behavior stays unchanged
- AND no captured mobile request is created for that traffic

#### Scenario: Malformed websocket payload does not change protocol behavior
- GIVEN an authenticated WebSocket client sends malformed JSON
- WHEN the bridge reads the payload
- THEN the existing malformed-message handling stays unchanged
- AND no captured mobile request is created from unreadable content
