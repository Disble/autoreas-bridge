# Delta for Observability

## ADDED Requirements

### Requirement: Transport-Level Capture Middleware

A single HTTP middleware wrapping the mux MUST record transport facts (method, route, HTTP status, duration, request/response headers, response body) for every request reaching the mux, without any per-handler capture code. Handlers MUST contribute only semantic facts (outcome, error_code, anime_id, correlation/changelog/conflict IDs) through a request-scoped enrichment mechanism read by the middleware after the handler returns.

#### Scenario: New endpoint is captured with zero handler code
- GIVEN a new HTTP endpoint is registered on the mux with no capture-related code in its handler
- WHEN a request reaches that endpoint
- THEN the middleware MUST record a capture row with the transport facts (method, route, status, duration)
- AND the row MUST NOT require any handler-side capture-building code

#### Scenario: Handler enriches the transport capture
- GIVEN a handler processes a request and determines a semantic outcome (e.g. `accepted`, `conflict`) and correlation IDs
- WHEN the handler calls the enrichment mechanism before returning
- THEN the middleware-recorded capture row MUST include those semantic facts alongside the transport facts

#### Scenario: WebSocket upgrade still works when wrapped
- GIVEN the capture middleware wraps the WebSocket upgrade route
- WHEN a client performs the WS upgrade handshake
- THEN the upgrade MUST succeed (no 500) via the wrapped writer's `Hijack` passthrough

### Requirement: Capture Survives Handler Panic Or Early Exit

The capture middleware MUST record a valid transport-only capture row even when the wrapped handler panics or returns without producing enrichment data, and MUST NOT block or fail the response path while doing so.

#### Scenario: Handler panics before enrichment
- GIVEN a handler panics after the middleware has started timing the request
- WHEN the middleware's deferred capture logic runs
- THEN a capture row with the transport facts (method, route, status, duration) MUST still be recorded
- AND the missing semantic enrichment MUST NOT cause the capture write itself to fail or block the response

### Requirement: Centralized WebSocket Message And Hub Capture

Inbound WebSocket reconcile messages MUST be captured at the message-pump seam (arrival and terminal outcome), and connection open/close plus outbound broadcasts MUST be captured once at the realtime hub's single fan-out point. The message-handling business logic MUST NOT construct capture records itself.

#### Scenario: Inbound message capture brackets the pump
- GIVEN a WebSocket client sends a reconcile message
- WHEN the message pump receives it
- THEN an arrival capture row MUST be recorded before the inner handler runs
- AND a terminal capture row reflecting the inner handler's returned outcome MUST be recorded after it completes
- AND the inner message-handling function MUST contain no capture-record construction

#### Scenario: Hub captures connection lifecycle and outbound broadcasts
- GIVEN a client registers, unregisters, or the hub broadcasts an anime/preferences/season change
- WHEN that hub operation executes
- THEN a capture row MUST be recorded for that lifecycle or outbound event without any per-caller capture code

### Requirement: Semantic Behavior Parity Through Enrichment

The outcomes, error codes, and correlation IDs previously recorded by per-handler capture code MUST be preserved when handlers migrate to the enrichment mechanism.

#### Scenario: Enriched capture matches prior per-handler semantics
- GIVEN a handler that previously built and enqueued its own capture record with a specific outcome and error_code
- WHEN the same request is processed under the middleware architecture using `capture.Enrich`
- THEN the resulting capture row MUST contain the same outcome, error_code, and correlation data as before the migration

## MODIFIED Requirements

### Requirement: Domain Runtime Events Are Observable

The system MUST log meaningful runtime events for anime, sync, api, websocket, and system flows. The redundant `http.request` log line MUST be removed from the api domain because the capture middleware is its full-fidelity, structured replacement.
(Previously: the `api` domain logged an `http.request` line per request via `RequestLoggingMiddleware`, duplicating what the mobile-request capture pipeline already recorded per handler.)

#### Scenario: Anime runtime activity is logged
- GIVEN startup catch-up, watcher, or writer activity occurs
- WHEN the component completes an important step or warning path
- THEN the logger MUST record an entry in the `anime` or `system` domain

#### Scenario: Sync and websocket propagation is logged
- GIVEN an `anime.changed` flow reaches sync or websocket boundaries
- WHEN downstream services react
- THEN the logger MUST record the receiving or forwarding action with the relevant domain prefix

#### Scenario: HTTP request log line is no longer emitted
- GIVEN a request completes through the capture middleware
- WHEN the middleware finishes recording the capture row
- THEN the `api` domain MUST NOT emit a separate `http.request` log line for that request
- AND the capture row remains the source of truth for that request's transport facts
