# Delta for Reconciliation Engine (SDD-08)

## ADDED Requirements

### Requirement: Pure Reconciliation Function
The reconcile function MUST be pure (no I/O, no global state). It MUST NOT depend on the database or network.

#### Scenario: Reconcile is pure
- GIVEN a local and remote entry
- WHEN the reconcile function is called
- THEN it returns the result without performing any I/O operations

### Requirement: ReconcileEntry Input
The function MUST accept two `ReconcileEntry` values (local, remote), each containing:
- `AnimeID` (string)
- `NroCapVisto` (float64)
- `UpdatedAtMs` (int64)

#### Scenario: Function signature
- GIVEN a valid local and remote `ReconcileEntry`
- WHEN passed to the reconcile function
- THEN it successfully processes them

### Requirement: ReconcileResult Output
The function MUST return a `ReconcileResult` containing:
- `Winner` (string/enum indicating local, remote, or tie)
- `MergedNroCapVisto` (float64)
- `NeedsRemoteWrite` (bool)

#### Scenario: Successful output structure
- GIVEN valid inputs
- WHEN the function completes
- THEN it returns a correctly populated `ReconcileResult`

### Requirement: CRDT-like MAX Rule
`NroCapVisto` MUST never decrease. The function MUST use a MAX rule to determine the merged value, explicitly ignoring Last-Write-Wins (LWW) based on timestamps.

#### Scenario: Local has higher chapter but older timestamp
- GIVEN Local(5.0, ts=100) vs Remote(3.0, ts=200)
- WHEN reconciled
- THEN Local wins
- AND NeedsRemoteWrite=false

#### Scenario: Remote has higher chapter but older timestamp
- GIVEN Local(3.0, ts=200) vs Remote(5.0, ts=100)
- WHEN reconciled
- THEN Remote wins
- AND NeedsRemoteWrite=true

#### Scenario: Tie with different timestamps
- GIVEN Local(10.5, ts=50) vs Remote(10.5, ts=999)
- WHEN reconciled
- THEN Tie
- AND NeedsRemoteWrite=false

#### Scenario: Remote higher with older timestamp (fractional)
- GIVEN Local(0.5, ts=1) vs Remote(1.0, ts=0)
- WHEN reconciled
- THEN Remote wins
- AND NeedsRemoteWrite=true

#### Scenario: Extreme timestamp difference
- GIVEN Local(12.0, ts=1000) vs Remote(0.0, ts=9999)
- WHEN reconciled
- THEN Local wins
- AND NeedsRemoteWrite=false

### Requirement: Missing Entries (First Sync)
The function MUST handle cases where one side is missing.

#### Scenario: Missing local
- GIVEN Missing local vs Remote(5.0)
- WHEN reconciled
- THEN Remote wins
- AND NeedsRemoteWrite=true

#### Scenario: Missing remote
- GIVEN Local(5.0) vs Missing remote
- WHEN reconciled
- THEN Local wins
- AND NeedsRemoteWrite=false

### Requirement: Caller Responsibility for Events
The caller (not the engine) is responsible for emitting `AnimeUpdateRequestedEvent`. The engine MUST NOT emit events directly.

#### Scenario: Event generation delegated
- GIVEN a result where Remote wins
- WHEN the caller receives the result
- THEN the caller emits the `AnimeUpdateRequestedEvent` (engine remains pure)

### Requirement: Tombstone Documentation
Tombstone entries (anime with `DeletedAt` set) MUST be documented in the code but their actual reconciliation logic is deferred to SDD-10.

#### Scenario: Tombstone handling
- GIVEN an entry with a tombstone
- WHEN processed
- THEN it behaves as documented for deferred SDD-10 implementation
