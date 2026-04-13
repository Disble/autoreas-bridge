# Frontend Specification

## Purpose

Define the bridge frontend pairing-panel contract for raw LAN visibility, one-time pairing token fallback, and the canonical QR payload used by Autoreas Mobile pairing.

## Requirements

### Requirement: Pairing Panel uses the canonical QR pairing payload

The Pairing Panel MUST display the raw LAN IP address, port, a copyable one-time pairing token, and a QR code encoding the canonical mobile deep link.

#### Scenario: Pairing IP visibility
- GIVEN the bridge is running on a local network
- WHEN the Pairing Panel is rendered
- THEN the IP address shown MUST be the raw LAN IP (not `localhost`)
- AND the port MUST remain visible next to that IP

#### Scenario: QR code renders canonical pairing deep link
- GIVEN the bridge is running on a local network at `{ip}` and `{port}`
- AND the Pairing Panel has generated `{pairing_token}`
- WHEN the Pairing Panel renders the QR code
- THEN the QR code MUST encode the exact deep link `autoreas-mobile://pair?v=1&ip={ip}&port={port}&token={pairing_token}`

#### Scenario: QR is withheld when required inputs are incomplete
- GIVEN the Pairing Panel does not yet have a complete IP, port, or pairing token
- WHEN the QR payload is derived
- THEN the panel MUST NOT render a QR payload for an incomplete pairing contract

#### Scenario: Manual token fallback remains visible
- GIVEN the user cannot scan the QR code
- WHEN the Pairing Panel is rendered
- THEN the one-time pairing token MUST still be displayed
- AND the token MUST be copyable as a manual fallback path
