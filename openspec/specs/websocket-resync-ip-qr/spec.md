# SDD-11 Specification: WebSocket Hub y Re-Sync Obligatorio

## Purpose

Definir el canal realtime del bridge mediante WebSocket autenticado, priorizando conexión explícita por IP local + QR/Token y obligando reconciliación REST tras cada conexión o reconexión.

## Requirements

### Requirement: WebSocket handshake requires authentication

The system MUST reject unauthenticated WebSocket handshakes.

#### Scenario: Missing bearer token
- GIVEN a client without a valid bearer token
- WHEN it attempts to connect to `WS /ws`
- THEN the bridge SHALL reject the connection

### Requirement: Every connection assumes gap and requires reconcile

The system MUST inform the client that a reconcile is required whenever a WebSocket connection is established or re-established.

#### Scenario: Initial connection receives sync_required
- GIVEN an authenticated device
- WHEN it connects to `WS /ws`
- THEN the bridge SHALL send a control message `sync_required`
- AND the client SHALL treat `POST /api/sync/reconcile` as mandatory before trusting new events

#### Scenario: Reconnection also receives sync_required
- GIVEN an authenticated device that reconnects after a disconnect
- WHEN the WebSocket session is re-established
- THEN the bridge SHALL send `sync_required` again

### Requirement: Anime changes are broadcast to connected devices

The system MUST broadcast `AnimeChangedEvent` messages to all connected WebSocket clients.

#### Scenario: Published anime change reaches connected clients
- GIVEN one or more authenticated WebSocket clients connected
- WHEN an `AnimeChangedEvent` is published on the Event Bus
- THEN the bridge SHALL deliver a realtime message describing that anime change to each connected client

### Requirement: Discovery strategy prioritizes IP local + QR/Token

The primary connection path for mobile clients MUST be explicit IP/port plus QR/Token information.

#### Scenario: No mDNS available
- GIVEN the environment does not support multicast discovery
- WHEN a user attempts to connect a mobile device
- THEN the bridge SHALL still support the primary flow using IP local + QR/Token
- AND the absence of mDNS SHALL NOT block SDD-11 success
