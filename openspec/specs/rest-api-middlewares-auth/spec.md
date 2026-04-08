# REST API, Middlewares y Autenticación Specification

## Purpose

Definir la primera superficie HTTP real del bridge con pairing mínimo, autenticación Bearer y enforcement de la sincronización asimétrica para endpoints de anime.

## Requirements

### Requirement: Embedded HTTP server lifecycle

The system MUST start an HTTP server as part of the current application lifecycle and MUST shut it down cleanly when the app stops.

#### Scenario: HTTP server starts with the app
- GIVEN the bridge app starts successfully
- WHEN startup wiring completes
- THEN the HTTP server SHALL be listening and ready to serve requests

#### Scenario: HTTP server stops on shutdown
- GIVEN the HTTP server is running
- WHEN app shutdown is invoked
- THEN the server SHALL stop accepting requests without leaking goroutines

### Requirement: Device pairing endpoint exists

The system MUST expose `POST /api/devices/pair` to pair a device using a pairing token and device name.

#### Scenario: Pair device with valid payload
- GIVEN a valid pairing token and a device name
- WHEN the client sends `POST /api/devices/pair`
- THEN the bridge SHALL persist the paired device
- AND the response SHALL include a bearer token for subsequent authenticated requests

#### Scenario: Reject malformed pairing payload
- GIVEN an invalid JSON body or missing required fields
- WHEN the client sends `POST /api/devices/pair`
- THEN the bridge SHALL return `400 Bad Request`

### Requirement: Bearer token middleware protects anime mutations

Protected anime endpoints MUST require `Authorization: Bearer <token>` with a valid persisted token.

#### Scenario: Missing token returns 401
- GIVEN a protected anime endpoint
- WHEN the request is sent without `Authorization` header
- THEN the bridge SHALL return `401 Unauthorized`

#### Scenario: Invalid token returns 401
- GIVEN a protected anime endpoint
- WHEN the request is sent with an unknown or invalid bearer token
- THEN the bridge SHALL return `401 Unauthorized`

### Requirement: Anime routes enforce asymmetric sync policy

The Tablet MUST NOT create or delete animes through the bridge API.

#### Scenario: POST /api/animes is blocked
- GIVEN the client targets `/api/animes`
- WHEN it sends `POST`
- THEN the bridge SHALL return `405 Method Not Allowed`

#### Scenario: DELETE /api/animes/:id is blocked
- GIVEN the client targets `/api/animes/:id`
- WHEN it sends `DELETE`
- THEN the bridge SHALL return `405 Method Not Allowed`

#### Scenario: PATCH /api/animes/:id remains the only allowed mutation route
- GIVEN the client targets `/api/animes/:id`
- WHEN it sends `PATCH`
- THEN the bridge SHALL route the request through bearer authentication
- AND actual business mutation MAY remain deferred until SDD-10

### Requirement: Method enforcement precedes auth for disallowed anime methods

The router MUST preserve `405 Method Not Allowed` for disallowed anime methods even if the request lacks authentication.

#### Scenario: Disallowed method without token still returns 405
- GIVEN the client sends `POST /api/animes` without `Authorization`
- WHEN the request reaches the router
- THEN the bridge SHALL return `405 Method Not Allowed`
- AND it SHALL NOT downgrade the response to `401 Unauthorized`
