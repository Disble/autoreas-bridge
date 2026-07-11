# Architecture Enforcement Specification

## Purpose

Define the lint-governed contract for maintained frontend source so declaration placement, documentation, barrel purity, and Wails runtime boundaries stay globally consistent and fixture-proven.

## Requirements

### Requirement: Global Maintained-Surface Governance

The system MUST treat `frontend/src/**/*.{ts,tsx}` as governed production source by default. The only confirmed documentation carve-out SHALL be generated `wailsjs/**`. Deliberately invalid fixture inputs MAY stay outside normal repo lint only inside the architecture-policy harness.

#### Scenario: Generated Wails fixture stays exempt
- GIVEN `frontend/eslint/__fixtures__/architecture-policy/wailsjs/go/main/App.js`
- WHEN normal repo lint evaluates generated bindings
- THEN the file MUST stay ignored by production documentation enforcement

#### Scenario: Harness-only invalid fixture stays testable
- GIVEN an intentionally invalid fixture under `frontend/eslint/__fixtures__/architecture-policy/src/**`
- WHEN the dedicated architecture-policy harness lints it
- THEN the harness MUST assert the expected failure while normal repo lint ignores the fixture tree

### Requirement: Split Module Ownership And Pure Barrels

Governed split modules that use sibling role files MUST live in a dedicated folder. `index.ts` SHALL contain re-exports only. `*.types.ts` MUST own interfaces and type aliases. `*.constants.ts` MUST own root-level constants. `*.helpers.ts` MUST own helper functions. Main UI, hook, adapter, and delivery modules MUST export only their named main function.

The migrated infrastructure adapters SHALL expose their public surface only through `frontend/src/infrastructure/<adapter>/index.ts`. No compatibility shim or production allowlist entry MAY remain once a migrated adapter folder is live.

#### Scenario: Season source fixture fails misplaced declarations
- GIVEN `src/infrastructure/season-source.ts`
- WHEN it declares a root-level constant and an interface inside the main adapter file
- THEN lint MUST reject the file for declaration ownership violations

#### Scenario: Bridge source fixture passes split ownership
- GIVEN `src/infrastructure/bridge-source.ts` with sibling `bridge-source.types.ts`, `.constants.ts`, and `.helpers.ts`
- WHEN the main adapter exports only `createBridgeSource`
- THEN lint MUST accept the adapter for ownership placement

#### Scenario: Root index barrel loses purity with local export
- GIVEN `src/index.ts`
- WHEN it re-exports modules and also defines `mixedBarrelMode`
- THEN lint MUST reject the barrel as impure

### Requirement: Delivery And Shared UI Runtime Boundaries

`frontend/src/App.tsx`, `frontend/src/app/**`, and shared `.tsx` views MUST stay composition or presentation only. They SHALL NOT call Wails bindings directly. The policy MUST expose one global prohibition on `window.go.*` access for maintained source instead of duplicating that rule per surface.

#### Scenario: App fixture requires documented delivery export
- GIVEN `src/App.tsx`
- WHEN its exported delivery function has no JSDoc
- THEN lint MUST reject the file

#### Scenario: Delivery TSX fixture requires documented export
- GIVEN `src/app/NotificationToasts.tsx`
- WHEN its exported delivery function has no JSDoc
- THEN lint MUST reject the file

#### Scenario: Shared UI fixture rejects direct window.go access
- GIVEN `src/shared/ui/WindowGoRuntime.tsx`
- WHEN the component calls `window.go.main.App.SyncNow()`
- THEN lint MUST reject the file through the single global `window.go.*` policy

### Requirement: Hook, Type, Helper, And Shared UI Contracts

Governed hooks, types, helpers, and shared UI modules MUST follow the global placement and documentation contract. Hook files MUST keep root-level declarations out of the main file. `*Props` fields in `*.types.ts` SHALL be `readonly`. Shared UI components MUST consume props through imported contracts and `Readonly<Props>` boundaries. Exported helper declarations MUST carry JSDoc.

#### Scenario: Root hook fixture fails root-level declaration
- GIVEN `src/hooks/use-notification-toasts.ts`
- WHEN it declares `TOAST_BY_LEVEL` in the hook file root
- THEN lint MUST reject the hook

#### Scenario: Types fixture fails missing docs and readonly
- GIVEN `src/shared/contracts/labeled-checkbox.types.ts`
- WHEN `LabeledCheckboxProps` lacks JSDoc and its `label` field is not `readonly`
- THEN lint MUST reject the file

#### Scenario: Helpers fixture fails inline contract and missing docs
- GIVEN `src/shared/ui/labeled-checkbox.helpers.ts`
- WHEN it declares `CheckboxLabelParts` inline and exports an undocumented helper
- THEN lint MUST reject the file

#### Scenario: Shared UI fixture fails inline props boundary
- GIVEN `src/shared/ui/LabeledCheckbox.tsx`
- WHEN it declares props inline and does not use `Readonly<Props>` from a `*.types.ts` contract
- THEN lint MUST reject the component
