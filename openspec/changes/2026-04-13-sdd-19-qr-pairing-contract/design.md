# Design: sdd-19-qr-pairing-contract

## Overview

The backend runtime already exposes the exact inputs this feature needs:

- `GetEffectiveAddress()` -> `{ip}:{port}`
- `GetPairingToken()` -> one-time token persisted in the pairing-token store

So the missing piece is NOT a new backend binding. The missing piece is a truthful bridge-side contract at the frontend/spec/docs boundary.

This change keeps the current Wails binding surface and moves the pairing contract into deterministic frontend helpers that compose a versioned deep-link QR payload.

## Architecture Decision

### Decision: Build the QR payload in the frontend from address + one-time token

The Pairing Panel already fetches the effective address and pairing token independently. We will keep that shape and compose the canonical QR payload in frontend helpers.

**Why this approach**
- Avoids unnecessary backend changes or new Wails bindings.
- Keeps the QR contract testable as a pure helper.
- Matches runtime truth: token generation and storage remain backend responsibilities; payload composition is a presentation contract.

## Contract Design

### Canonical QR payload v1

The QR payload SHALL be exactly:

```text
autoreas-mobile://pair?v=1&ip={LAN_IP}&port={PORT}&token={PAIRING_TOKEN}
```

### Required fields

- `v=1`
- `ip`
- `port`
- `token` (the one-time pairing token)

### Exclusions

- No `auth_token`
- No raw `http://{ip}:{port}` fallback payload
- No websocket URL in the QR

## Frontend Design

### 1. Helper boundary

`pairing-panel.helpers.ts` will remain the single pure boundary for:

- parsing the effective address
- building the deep-link QR payload
- generating the QR image data URL

To keep colocation clean and compliant with frontend rules, the deep-link payload input shape will live in `pairing-panel.types.ts` rather than inline in the helper or hook.

### 2. Hook flow

`use-pairing-panel.ts` keeps the current data flow:

1. fetch effective address
2. fetch pairing token
3. derive parsed IP/port
4. derive QR payload only when `ip`, `port`, and `token` are present
5. render QR image from the payload

This preserves the existing hook anatomy and makes the QR disappear safely if required data is missing.

### 3. UI semantics

`PairingPanel.tsx` keeps the same visual structure:

- LAN chip with raw `ip:port`
- QR image
- copyable token

Only the wording changes so the UI tells the truth: scan the QR for the fast path, but manual token entry remains the fallback path.

## Spec / Documentation Design

### 1. Frontend spec delta

Update the Pairing Panel requirement so the QR encodes the versioned deep link instead of the raw HTTP URL.

### 2. Discovery spec delta

Extend the IP + QR/Token discovery rule to make the QR payload contract explicit and to codify that mDNS absence does not block success.

### 3. Mobile sync contract delta

Codify the real pairing-token/auth-token semantics because the bridge runtime already behaves this way and the docs must stop lying.

### 4. Bridge docs alignment

Update both design-doc variants plus README so they consistently state:

- primary pairing/discovery path = explicit IP + QR/Token
- mDNS = best-effort / future convenience only
- `pairing_token` = one-shot input
- `auth_token` = persistent output credential

## Testing Strategy

### Strict TDD slices

1. RED — helper tests expect the v1 deep-link payload instead of `http://{ip}:{port}`.
2. RED — hook tests expect QR generation only after token + address are both available.
3. GREEN — implement helper/hook changes minimally.
4. REFACTOR — tighten wording and type names without changing behavior.

### Verification

- `bun --cwd="frontend" run test -- PairingPanel`
- `bun --cwd="frontend" run lint`

No build command is allowed in this repo workflow.

## Files Expected to Change

- `frontend/src/features/dashboard/ui/PairingPanel/pairing-panel.helpers.ts`
- `frontend/src/features/dashboard/ui/PairingPanel/pairing-panel.types.ts`
- `frontend/src/features/dashboard/ui/PairingPanel/use-pairing-panel.ts`
- `frontend/src/features/dashboard/ui/PairingPanel/PairingPanel.tsx`
- `frontend/src/features/dashboard/ui/PairingPanel/__tests__/pairing-panel.helpers.test.ts`
- `frontend/src/features/dashboard/ui/PairingPanel/__tests__/use-pairing-panel.test.ts`
- `docs/Autoreas bridge design doc.md`
- `docs/autoreas-bridge-design-doc.md`
- `docs/rfc-mobile-bridge-qr-pairing.md`
- `README.md`

## Migration / Rollout Notes

- No DB migration is needed.
- No API route changes are needed.
- Existing mobile apps that only understand the old HTTP-only QR are intentionally outside compatibility scope for this feature because that QR was a discarded PoC, not the final contract.
