# Tasks: sdd-19-qr-pairing-contract

## Phase 1: SDD artifacts

- [x] 1.1 Create proposal, design, tasks, verify-report skeleton, and spec deltas for the QR pairing contract change.
- [x] 1.2 Record the canonical QR decision: `autoreas-mobile://pair?v=1&ip={LAN_IP}&port={PORT}&token={PAIRING_TOKEN}` with no legacy HTTP QR fallback.

## Phase 2: Strict TDD — Pairing Panel contract

- [x] 2.1 RED — update `pairing-panel.helpers.test.ts` to expect the versioned deep-link payload and encoded QR image value.
- [x] 2.2 RED — update `use-pairing-panel.test.ts` to require token + address before QR generation succeeds.
- [x] 2.3 GREEN — implement the minimal helper/type/hook changes required to satisfy the new QR contract.
- [x] 2.4 REFACTOR — keep helper JSDoc, hook anatomy, and feature colocation rules compliant.

## Phase 3: UI truthfulness

- [x] 3.1 Update `PairingPanel.tsx` wording so it clearly communicates QR first, manual token fallback second.
- [x] 3.2 Keep raw LAN IP/port visible and copy token behavior unchanged.

## Phase 4: Specs and docs alignment

- [x] 4.1 Add frontend spec delta for the new QR payload contract.
- [x] 4.2 Add websocket/discovery spec delta that makes the QR v1 payload explicit.
- [x] 4.3 Add mobile sync contract delta for one-shot `pairing_token` input vs persistent `auth_token` output.
- [x] 4.4 Update bridge design docs and README to remove mDNS-first/permanent-pairing-token wording.
- [x] 4.5 Keep `docs/rfc-mobile-bridge-qr-pairing.md` aligned as the narrative reference for the cross-app contract.

## Phase 5: Verification

- [x] 5.1 Run `bun --cwd="frontend" run test -- PairingPanel`.
- [x] 5.2 Run `bun --cwd="frontend" run lint`.
- [x] 5.3 Update `verify-report.md` with requirement-by-requirement evidence and final verdict.
