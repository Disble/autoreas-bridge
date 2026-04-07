# Tracer Bullet Wiring Specification

## Purpose

Demostrar que el wiring principal del bridge puede conectar bounded contexts desacoplados sobre el Event Bus antes de introducir más infraestructura real.

## Requirements

### Requirement: Dummy domains are wired through the shared Event Bus

The system MUST instantiate the tracer bullet using a shared `internal/events.Bus` instead of direct cross-domain calls.

#### Scenario: Wiring creates the tracer bullet roles
- GIVEN the application startup wiring is executed
- WHEN the tracer bullet is initialized
- THEN the system SHALL create dummy roles for `anime`, `sync`, `device/websocket`, and `system`
- AND those roles SHALL communicate through the shared Event Bus contract

#### Scenario: Existing startup responsibilities remain intact
- GIVEN the application already performs SQLite bootstrap and anime startup catch-up wiring
- WHEN the tracer bullet is added
- THEN the tracer bullet MUST coexist with the existing startup flow
- AND it MUST NOT replace the real bootstrap/catch-up responsibilities introduced by earlier SDD changes

### Requirement: Event traversal is observable end-to-end

The system MUST expose deterministic evidence that an `AnimeChangedEvent` traveled from the dummy anime publisher to the dummy websocket consumer through the bus.

#### Scenario: Dummy anime publishes a simulated change
- GIVEN the tracer bullet runner is ready
- WHEN the dummy anime role emits a simulated change
- THEN the system SHALL publish an `AnimeChangedEvent`
- AND the trace output SHALL record that the anime role initiated the event

#### Scenario: Downstream dummy consumers observe the event
- GIVEN an `AnimeChangedEvent` has been published by the dummy anime role
- WHEN subscribed dummy consumers process it
- THEN the dummy sync role SHALL record that it received the change
- AND the dummy websocket role SHALL record that it forwarded the change

### Requirement: The tracer bullet stays intentionally minimal

The system SHOULD keep the tracer bullet focused on architectural wiring rather than real infrastructure behavior.

#### Scenario: No premature infrastructure is introduced
- GIVEN this change is limited to `SDD-01`
- WHEN implementation is completed
- THEN it MUST NOT introduce real watcher, REST, WebSocket, or mDNS behavior
- AND it MAY use dummy payloads and in-memory trace sinks to prove the flow
