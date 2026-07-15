# SDD-50 Conflict Seams Specification

Change: `2026-07-14-sdd-49-anime-repeat-restore-edit`
Capability: `sdd-50-conflict-seams`

## Purpose

SDD-49 MUST expose durable version and base-state contracts required by SDD-50,
without implementing merge, resolution behavior, or resolution UI.

## Requirements

### Requirement: Writes return authoritative outcomes and tokens

A successful Create MUST return its id and current `modified_at`. Repeat and
Restore MUST return the current token and an explicit `applied`, `no_op`, or
`conflict` outcome. A conflict result MUST identify the recorded conflict. A
failed operation MUST return an error instead of an applied outcome.

#### Scenario: Applied update returns a new token

- **GIVEN** a Repeat or Restore has a matching base
- **WHEN** the update is applied
- **THEN** the result is `applied` with the advanced `modified_at`

#### Scenario: Stale update returns current authority

- **GIVEN** an explicit base differs from the current token
- **WHEN** the desired update differs from current state
- **THEN** the result is `conflict` with the current token and conflict identity
- **AND** the desired update is not applied

### Requirement: Pre-write state is durable and queryable

For every applied Repeat or Restore, the bridge MUST durably retain the complete
pre-write raw envelope, its base token, and the resulting token. The seam MUST
support querying by anime and token after restart and MUST preserve nullable and
unknown fields. SDD-49 MUST define retention ownership and MUST NOT discard these
rows before SDD-50 establishes a safe cleanup policy.

#### Scenario: Prior state survives restart

- **GIVEN** an update from T1 to T2 was applied
- **WHEN** the bridge restarts and the base seam is queried for that anime and T2
- **THEN** it returns the complete state that existed at T1

### Requirement: Interrupted writes are recoverable

Before append, the bridge MUST durably stage an operation identity, pre-write
state, intended state/hash, and intended token. A definite append failure MUST
leave no live staged operation and MUST return an error. After an ambiguous
append or finalization failure, startup or same-operation retry MUST compare the
effective Legacy state with the staged hashes: finalize an intended-state match,
retry a base-state match, or preserve and report divergence when neither matches.
Recovery MUST NOT duplicate an already-effective append or claim success before
the operation is committed.

#### Scenario: Finalization failure recovers without losing the base

- **GIVEN** the intended Legacy line was appended but SQLite finalization failed
- **WHEN** recovery finds effective Legacy state matching the staged desired hash
- **THEN** it commits the intended token and retains the staged pre-write state
- **AND** it does not append the same operation again

#### Scenario: Definite append failure is cleaned up

- **GIVEN** a staged update whose canonical append definitively fails
- **WHEN** the failure is handled
- **THEN** the operation is aborted and the caller receives an error
- **AND** no applied outcome or token advance is reported

### Requirement: Explicit stale bases record without overwriting

When a base-aware Bridge update is stale and non-no-op, the bridge MUST record
the current and requested states, MUST leave canonical state and `modified_at`
unchanged, and MUST return `conflict`. Base-less older clients MAY remain on the
staged observe-only compatibility path until migrated.

#### Scenario: Stale Repeat records conflict

- **GIVEN** Repeat is requested with stale base T1 while current is T2
- **WHEN** divergence is detected
- **THEN** a pending conflict preserves current and requested states
- **AND** no append, token advance, merge, or resolution occurs

### Requirement: Resolution remains outside SDD-49

This capability MUST NOT choose winners, merge fields, resolve conflicts, or add
conflict-resolution UI. Those behaviors belong exclusively to SDD-50.

#### Scenario: Seam data remains unresolved

- **GIVEN** a conflict and its pre-write base are stored
- **WHEN** SDD-49 completes
- **THEN** the conflict remains pending for SDD-50
