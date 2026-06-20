# Frontend Architecture Specification (Hexagonal Foundation)

## Purpose

Defines the hexagonal ports/adapters foundation introduced for the frontend: an `infrastructure/` layer wrapping Wails transport, pure DTOs in `shared/contracts/`, dependency-injected hooks, and a Zustand read-model store with a pure correlationId-folding reducer. This is the prerequisite layer (Slice A) that the Network feature (Slice B) and all existing dashboard hooks depend on.

## Requirements

### Requirement: Wails Transport Port

The system MUST expose Wails runtime access (event subscription and data fetch) exclusively through a port interface defined in `infrastructure/`. No file outside `infrastructure/` MUST import `wailsjs/*`, `window.go`, or `window.runtime` directly.

#### Scenario: Port interface shape
- GIVEN the infrastructure layer
- WHEN a port is defined for an observability/runtime data source
- THEN it MUST expose at least a `subscribe(listener)` method and a `fetch()`/`getRecent()` method
- AND it MUST NOT leak Wails-specific types in its public signature

#### Scenario: Singleton source with pub-sub
- GIVEN multiple consumers need the same Wails event stream
- WHEN more than one hook subscribes to the same port
- THEN the underlying adapter MUST share a single singleton source with a listener set (no duplicate Wails subscriptions)

#### Scenario: Graceful no-op degradation outside Wails runtime
- GIVEN the code runs in a browser/Vite context where `window.runtime` or `window.go` is undefined
- WHEN the adapter is initialized or a port method is called
- THEN it MUST degrade to a no-op (no throw, no crash) and return empty/default data

### Requirement: Pure Shared Contracts

`shared/contracts/` MUST hold pure DTOs consumed across features, including the observability log entry type. These files MUST NOT import from `infrastructure/`, `wailsjs/*`, or any feature folder.

#### Scenario: Readonly DTO fields
- GIVEN a DTO defined in `shared/contracts/`
- WHEN its fields are declared
- THEN every field MUST be `readonly`

#### Scenario: No backward import
- GIVEN `shared/contracts/observability.types.ts` defines `ObservabilityLogEntry`
- WHEN any feature (e.g. dashboard) needs this type
- THEN the feature MUST import it from `shared/contracts/`, not the reverse

### Requirement: Hook Migration to Dependency Injection

The four existing hooks (`use-observability-panel`, `use-pairing-panel`, `use-bridge-status-card`, `use-bridge-dashboard`) MUST consume the Wails port via injection (an optional `source` parameter defaulting to the singleton adapter) instead of importing `dashboard.bindings.ts` directly. `dashboard.bindings.ts` MUST be deleted once migration completes.

#### Scenario: Behavior parity after migration
- GIVEN a hook migrated to use the injected port
- WHEN it is rendered with the default (production) source
- THEN its observable behavior (data shape, loading/error states, side effects) MUST be identical to its pre-migration behavior

#### Scenario: Test injects a fake source
- GIVEN a hook's test suite
- WHEN the test exercises the hook
- THEN it MUST inject a fake/stub implementation of the port via the `source` parameter
- AND it MUST NOT use `vi.mock` on a module path (e.g. `vi.mock('../../dashboard.bindings')`)

#### Scenario: No half-migrated state
- GIVEN the migration is applied
- WHEN any of the four hooks is inspected
- THEN all four MUST be migrated together; none MUST still import `dashboard.bindings.ts`

### Requirement: Read-Model Store with CorrelationId Reducer

`shared/store/` MUST provide a Zustand store that ingests the observability event stream by appending entries with a capped buffer, and a separate PURE reducer/selector that folds raw log entries by `correlationId` into request rows.

#### Scenario: Append-and-cap ingest
- GIVEN the store has reached its configured capacity
- WHEN a new event arrives via the port subscription
- THEN the store MUST append the new entry and evict the oldest entry so the buffer size MUST NOT exceed the configured cap

#### Scenario: Fold by correlationId — dedupe and last-write-wins
- GIVEN two or more raw log entries share the same `correlationId`
- WHEN the pure reducer folds entries into request rows
- THEN the result MUST contain exactly one row per distinct `correlationId`
- AND for fields such as status and duration, the row MUST reflect the most recently ingested entry for that `correlationId`

#### Scenario: Order-stable output
- GIVEN a sequence of entries with distinct `correlationId`s ingested in order
- WHEN the reducer produces request rows
- THEN the row order MUST be stable and consistent with first-appearance order of each `correlationId`

#### Scenario: Reducer purity
- GIVEN the correlationId-folding reducer
- WHEN it is invoked with the same input array
- THEN it MUST return an equivalent result every time with no side effects (no Wails calls, no mutation of input)
