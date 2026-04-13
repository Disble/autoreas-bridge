# SDD-16 Specification: Mobile Sync Contract

## Purpose

Codify the bridge-side pairing semantics that Autoreas Mobile already depends on: one-shot pairing tokens for enrollment and persistent auth tokens for authenticated sync afterward.

## Requirements

### Requirement: Device pairing distinguishes one-shot pairing from persistent authentication

The system MUST accept a one-time `pairing_token` to enroll a device and MUST return a persistent `auth_token` for all subsequent authenticated requests.

#### Scenario: Pair device with one-time pairing token
- GIVEN the bridge has generated a one-time pairing token for the pairing panel
- WHEN a mobile client sends `POST /api/devices/pair` with `{"pairing_token":"...","device_name":"AutoreasMobile"}`
- THEN the bridge SHALL validate and consume that pairing token
- AND the response SHALL include `device_id`, `device_name`, and `auth_token`

#### Scenario: QR payload carries pairing token only
- GIVEN the bridge renders a QR code for device pairing
- WHEN the QR payload is generated
- THEN the payload SHALL include the one-time `pairing_token`
- AND the payload SHALL NOT include `auth_token`
