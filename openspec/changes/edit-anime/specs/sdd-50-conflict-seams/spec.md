# Delta for SDD-50 Conflict Seams

## MODIFIED Requirements

### Requirement: Writes return authoritative outcomes and tokens

A successful Create MUST return its id and current `modified_at`. Repeat, Restore, and general editor saves MUST return the current token and an explicit `applied`, `no_op`, or `conflict` outcome. A schedule bulk apply MUST return an explicit accepted or rejected authoritative outcome for the whole draft plus the refreshed authority needed to continue safely. A conflict result MUST identify the recorded conflict. A failed operation MUST return an error instead of an applied outcome.

(Previously: The requirement covered Create, Repeat, and Restore outcomes, but it did not extend the same authoritative contract to general editor saves or whole-draft schedule apply.)

#### Scenario: Applied update returns a new token

- **GIVEN** a Repeat or Restore has a matching base
- **WHEN** the update is applied
- **THEN** the result is `applied` with the advanced `modified_at`

#### Scenario: Stale update returns current authority

- **GIVEN** an explicit base differs from the current token
- **WHEN** the desired update differs from current state
- **THEN** the result is `conflict` with the current token and conflict identity
- **AND** the desired update is not applied

#### Scenario: Schedule bulk apply returns whole-draft authority

- **GIVEN** a schedule draft spans multiple anime with current base tokens
- **WHEN** the whole draft is accepted
- **THEN** the result reports accepted authoritative completion for the draft
- **AND** the caller receives the refreshed authority needed to continue from the new state

### Requirement: Explicit stale bases record without overwriting

When a base-aware Bridge update is stale and non-no-op, the bridge MUST record the current and requested states, MUST leave canonical state and `modified_at` unchanged, and MUST return `conflict`. The same rule MUST apply to general editor saves and to schedule bulk apply when any participating anime has stale authority. Base-less older clients MAY remain on the staged observe-only compatibility path until migrated.

(Previously: The stale-base rule applied generally, but it did not explicitly call out general editor saves or whole-draft rejection for schedule apply.)

#### Scenario: Stale Repeat records conflict

- **GIVEN** Repeat is requested with stale base T1 while current is T2
- **WHEN** divergence is detected
- **THEN** a pending conflict preserves current and requested states
- **AND** no append, token advance, merge, or resolution occurs

#### Scenario: One stale anime rejects a shared schedule draft

- **GIVEN** a schedule draft includes anime A and B and anime B advanced after modal open
- **WHEN** the user applies the draft
- **THEN** the bridge records the stale conflict against current authority and returns rejection for the whole draft
- **AND** no participating anime is partially overwritten or advanced
