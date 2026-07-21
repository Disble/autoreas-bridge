# Delta for Frontend

## MODIFIED Requirements

### Requirement: Bridge Status Panel

The Bridge Status health strip MUST display the current health of the SQLite database and bridge services by calling the `GetSQLiteStatus` Wails binding. This health strip MUST be surfaced on the Activity page (merged with the network log), not on a standalone Status or Dashboard route.
(Previously: rendered on a standalone Bridge Status route/panel)

#### Scenario: Startup OK
- GIVEN all services including the SQLite database have started successfully
- WHEN the frontend queries the bridge status
- THEN the panel MUST display "ok"

#### Scenario: Startup Error
- GIVEN the SQLite database or bridge services failed to start
- WHEN the frontend queries the bridge status
- THEN the panel MUST display the corresponding error string

#### Scenario: Location on Activity page
- GIVEN the user navigates to the Activity page
- WHEN the page renders
- THEN the bridge status health strip MUST be visible alongside the network log
- AND no standalone `/status` route MUST exist

### Requirement: Pairing Panel

The Pairing Panel MUST display the raw LAN IP address, port, a copyable one-time pairing token, and a QR code encoding the canonical mobile deep link for device pairing. This panel MUST be surfaced on the Devices page, alongside Connected Devices, Syncing Now, and Trigger Reconcile, not on a standalone Pairing route.
(Previously: rendered on a standalone Pairing route/panel)

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

#### Scenario: Location on Devices page
- GIVEN the user navigates to the Devices page
- WHEN the page renders
- THEN the Pairing Panel MUST be visible alongside Connected Devices, Syncing Now, and Trigger Reconcile
- AND no standalone `/pairing` route MUST exist

## ADDED Requirements

### Requirement: Devices Page Composition

The Devices page MUST compose four sections from existing panels without introducing new business logic: Pairing (QR/token), Connected Devices, Syncing Now, and Trigger Reconcile.

#### Scenario: All four sections present
- GIVEN the user navigates to the Devices page
- WHEN the page renders
- THEN Pairing, Connected Devices, Syncing Now, and Trigger Reconcile sections MUST all be visible
- AND each section MUST reuse its existing hook/panel without duplicating business logic

### Requirement: BridgeDashboard Removal

The legacy `BridgeDashboard` component, including its dead legacy log block, MUST be removed. Its Trigger Reconcile capability MUST be relocated to the Devices page.

#### Scenario: Dashboard route removed
- GIVEN the navigation restructure is applied
- WHEN the router is inspected
- THEN no `/dashboard` route MUST render `BridgeDashboard`
- AND the dead legacy log block MUST NOT exist anywhere in the codebase

#### Scenario: Reconcile relocated
- GIVEN the user navigates to the Devices page
- WHEN the user triggers reconcile
- THEN the reconcile action MUST behave identically to the removed Dashboard's Trigger Reconcile
