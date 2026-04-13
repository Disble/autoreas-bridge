# Proposal: sdd-19-qr-pairing-contract

## Summary

Replace the stale Bridge pairing QR proof-of-concept with the versioned deep-link contract required by the new mobile pairing RFC. The Bridge frontend must encode LAN IP, port, and one-time `pairing_token` into the QR payload, while bridge-side specs and docs must stop describing mDNS-first discovery and stop conflating one-shot pairing tokens with persistent auth tokens.

## Problem Statement

Today the bridge pairing panel still renders a QR that encodes only `http://{ip}:{port}`. That is NOT enough to complete pairing end-to-end because mobile still needs the token separately. The active frontend spec also hardcodes that outdated HTTP payload, and the bridge design docs still describe mDNS as the principal discovery path plus a “permanent pairing token” model that contradicts the runtime.

This leaves three sources of truth fighting each other:

1. Runtime truth: bridge already exposes raw LAN address and generates one-time pairing tokens.
2. RFC truth: canonical QR payload is `autoreas-mobile://pair?v=1&ip={LAN_IP}&port={PORT}&token={PAIRING_TOKEN}`.
3. Active bridge spec/docs: still describe `http://{ip}:{port}`, mDNS-first discovery, and permanent pairing tokens.

## Goals

1. Make the Bridge QR payload match the canonical pairing contract.
2. Keep the manual token path visible as a resilience fallback.
3. Align active bridge specs/docs with runtime truth: explicit IP + QR/Token first, one-shot `pairing_token`, persistent `auth_token` after pairing.
4. Remove bridge-side dependency on the discarded HTTP-only QR PoC.

## Non-Goals

- Implementing the mobile QR scanner in this repo.
- Changing the existing pair endpoint shape, which already accepts `pairing_token` and returns `auth_token`.
- Adding mDNS discovery as a required success path.
- Adding token TTL/regeneration UX in this change.

## Proposed Change

1. Update the dashboard Pairing Panel helper/hook contract so the QR payload is built from `{ip, port, pairingToken}` using the official `autoreas-mobile://pair` deep link and version `v=1`.
2. Update frontend tests first (strict TDD) so the old HTTP-only QR contract fails before implementation is changed.
3. Keep the token visible and copyable in the UI as the manual fallback path.
4. Add SDD delta specs for:
   - frontend pairing panel payload and fallback wording
   - QR-based discovery contract under websocket/discovery scope
   - pairing-token/auth-token semantics under the mobile sync contract
5. Update bridge documentation (`docs/Autoreas bridge design doc.md`, tracked design doc, README as needed) so it reflects explicit IP + QR/Token as primary and documents the real token lifecycle.

## Key Decisions

- The official scheme is `autoreas-mobile://`, not `autoreas://`.
- The QR payload is versioned and canonical: `autoreas-mobile://pair?v=1&ip={LAN_IP}&port={PORT}&token={PAIRING_TOKEN}`.
- The Bridge does NOT preserve backward compatibility for the discarded `http://{ip}:{port}` QR proof-of-concept.
- `pairing_token` is one-shot input for `POST /api/devices/pair`; `auth_token` is the persistent credential returned after pairing.

## Affected Modules

- `frontend/src/features/dashboard/ui/PairingPanel/*`
- `openspec/specs/frontend/spec.md` (via active change delta)
- `openspec/specs/websocket-resync-ip-qr/spec.md` (via active change delta)
- `openspec/specs/mobile-sync-contract/spec.md` (via active change delta)
- `docs/Autoreas bridge design doc.md`
- `docs/autoreas-bridge-design-doc.md`
- `README.md`

## Risks and Mitigations

- **Risk:** Token characters break the QR contract if concatenated manually.
  - **Mitigation:** Build the payload with structured query encoding.
- **Risk:** Docs keep drifting because multiple bridge design docs exist.
  - **Mitigation:** Update both bridge design-doc variants in the repo and keep wording identical on the pairing sections.
- **Risk:** Mobile work is mistaken as part of this repo change.
  - **Mitigation:** State explicitly that bridge-side implementation is limited to QR contract generation, tests, specs, and docs alignment.

## Rollback Plan

If this change causes regressions, restore the prior Pairing Panel helper/hook/tests, remove the active SDD delta artifacts, and revert the docs to the previous pairing description. No database or API schema rollback is required because the pair endpoint contract itself does not change.
