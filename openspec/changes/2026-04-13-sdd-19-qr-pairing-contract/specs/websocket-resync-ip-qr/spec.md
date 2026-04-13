# SDD-11 Specification: WebSocket Hub y Re-Sync Obligatorio

## Purpose

Mantener la conexión realtime autenticada del bridge priorizando la estrategia explícita por IP local + QR/Token y haciendo explícito el contrato QR versionado para pairing mobile.

## Requirements

### Requirement: Discovery strategy prioritizes explicit IP + QR/Token

The primary connection path for mobile clients MUST be explicit IP/port plus QR/Token information, without depending on mDNS as a required success path.

#### Scenario: QR payload uses canonical pairing contract
- GIVEN the bridge exposes its effective LAN address and a one-time pairing token
- WHEN the user opens the pairing panel
- THEN the QR payload SHALL be the exact deep link `autoreas-mobile://pair?v=1&ip={ip}&port={port}&token={pairing_token}`
- AND the bridge SHALL keep the raw IP/port and token visible for manual fallback

#### Scenario: No mDNS available
- GIVEN the environment does not support multicast discovery
- WHEN a user attempts to connect a mobile device
- THEN the bridge SHALL still support the primary flow using explicit IP/port plus QR/Token
- AND the absence of mDNS SHALL NOT block success for this slice
