# Frontend Specification

## Purpose

This specification defines the frontend MVP for the `autoreas-bridge`, including the package baseline, bridge status display, mobile pairing panel, and the corresponding Wails Go bindings.

## Requirements

### Requirement: Package Baseline

The frontend package configuration MUST use exact version pinning for dependencies, include ESLint for code quality, and provide a `lint` script.

#### Scenario: ESLint Execution
- GIVEN the frontend project has ESLint configured
- WHEN the developer runs `bun run lint`
- THEN the execution MUST pass cleanly with no errors
- AND `bun run build` MUST succeed cleanly

### Requirement: Bridge Status Panel

The Bridge Status Panel MUST display the current health of the SQLite database and bridge services by calling the `GetSQLiteStatus` Wails binding.

#### Scenario: Startup OK
- GIVEN all services including the SQLite database have started successfully
- WHEN the frontend queries the bridge status
- THEN the panel MUST display "ok"

#### Scenario: Startup Error
- GIVEN the SQLite database or bridge services failed to start
- WHEN the frontend queries the bridge status
- THEN the panel MUST display the corresponding error string

### Requirement: Pairing Panel

The Pairing Panel MUST display the raw LAN IP address, port, a copyable one-time pairing token, and a QR code encoding the canonical mobile deep link for device pairing.

#### Scenario: Pairing IP Visibility
- GIVEN the bridge is running on a local network
- WHEN the Pairing Panel is rendered
- THEN the IP address shown MUST be the raw LAN IP (not "localhost")
- AND the port MUST remain visible next to that IP

#### Scenario: QR Code Rendering
- GIVEN the bridge is running on a local network at `{ip}` and `{port}`
- AND the Pairing Panel has generated `{pairing_token}`
- WHEN the Pairing Panel renders the QR code
- THEN the QR code MUST encode the exact deep link `autoreas-mobile://pair?v=1&ip={ip}&port={port}&token={pairing_token}`

#### Scenario: QR withheld until the contract is complete
- GIVEN the Pairing Panel does not yet have a complete IP, port, or pairing token
- WHEN the QR payload is derived
- THEN the panel MUST NOT render a QR payload for an incomplete pairing contract

#### Scenario: Token Generation
- GIVEN the user requests to pair a device
- WHEN the Pairing Panel requests a token
- THEN a one-time token string MUST be generated and displayed
- AND the token MUST be copyable as a manual fallback path

### Requirement: Wails Binding - GetSQLiteStatus

The `GetSQLiteStatus()` Wails binding MUST return the current status of the SQLite database.

#### Scenario: DB Available
- GIVEN the SQLite database is initialized and available
- WHEN `GetSQLiteStatus()` is called
- THEN it MUST return the string "ok"

#### Scenario: DB Unavailable
- GIVEN the SQLite database is nil or unavailable
- WHEN `GetSQLiteStatus()` is called
- THEN it MUST return an error string

### Requirement: Wails Binding - GetPairingToken

The `GetPairingToken()` Wails binding MUST generate, persist, and return a one-time pairing token.

#### Scenario: Token Persistence
- GIVEN the backend is functioning normally
- WHEN `GetPairingToken()` is called
- THEN it MUST persist the generated token via `device.Store`
- AND it MUST return the token string

#### Scenario: Token Generation Failure
- GIVEN the database or `device.Store` is nil
- WHEN `GetPairingToken()` is called
- THEN it MUST gracefully degrade and return an error string
