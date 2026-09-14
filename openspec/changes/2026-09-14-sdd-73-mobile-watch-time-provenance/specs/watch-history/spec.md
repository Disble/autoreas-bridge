# Delta for Watch History

## ADDED Requirements

### Requirement: The Landing Episode Carries The Source-Reported Time

A `Change` MAY carry the instant its source reported for the progress it describes
(`ReportedAtMS`), separately from the instant the change was observed (`OccurredAtMS`). When
it is present and usable, the recorder MUST store it as the `watched_at_ms` of the **highest
newly reached episode** of that change — the landing episode. Every other newly reached
episode MUST keep `OccurredAtMS`.

A reported instant is usable only when it is strictly positive and not later than
`OccurredAtMS`. The recorder MUST NOT require any minimum age: an offline phone may
legitimately report a watch time days before the sync that carries it.

When the reported instant is absent or unusable, the recorder MUST fall back to
`OccurredAtMS` for every episode, which is exactly the behaviour that existed before this
requirement. A rejected instant MUST NOT block, fail or partially apply the change.

This rule is a property of the pure derivation and MUST hold identically for a live write and
for a replayed one.

#### Scenario: A phone-marked episode keeps its watch time
- GIVEN an anime whose progress advances from 8 to 9
- AND the change reports an instant 17 hours before the bridge observed it
- WHEN the recorder records the change
- THEN the row for episode 9 MUST store the reported instant
- AND no other row MUST be created for it

#### Scenario: A future instant is rejected, never stored
- GIVEN a change reporting an instant later than the bridge observed it
- WHEN the recorder records the change
- THEN the row MUST store the observed instant
- AND the change MUST still apply

#### Scenario: A missing or non-positive instant falls back
- GIVEN a change whose reported instant is absent, zero or negative
- WHEN the recorder records the change
- THEN every row MUST store the observed instant

#### Scenario: Only the landing episode takes the reported instant
- GIVEN an anime whose progress advances from 6 to 8 in one change
- AND the change reports an instant well before it was observed
- WHEN the recorder records the change
- THEN the row for episode 8 MUST store the reported instant
- AND the row for episode 7 MUST store the observed instant
- AND both rows MUST be created

#### Scenario: Desktop and inferred behaviour is unchanged
- GIVEN a change that carries no reported instant
- WHEN the recorder records it
- THEN the recorded rows MUST be identical to those recorded before this requirement existed

### Requirement: Recording Provenance Survives A Replay

The audit row written for a change MUST retain the change's reported instant when it has one,
independently of the row's own observation instant. The one-shot replay MUST feed that
retained value back into the same derivation, so a replay reproduces the rows live recording
produced rather than reconstructing the pre-existing behaviour.

The audit row's own observation instant MUST remain the instant the bridge observed the
change; it MUST NOT be overwritten by the reported one.

#### Scenario: A replay reproduces the live row
- GIVEN a recorded mobile change that carried a reported instant
- WHEN its audit row is replayed into an empty projection
- THEN the resulting row MUST store the same instant and episode as the live recording did

#### Scenario: The audit instant is not replaced
- GIVEN an audit row for a change that carried a reported instant
- WHEN the row is persisted
- THEN its observation instant MUST remain the instant the bridge observed the change

## Note on stored rows written before this change

Correcting rows that already exist is deliberately **not** part of this capability. It is a
maintenance operation on a database — performed once, outside the application — and it ships
no code, marker or command. A database that has not had it performed keeps its earlier
instants, and nothing in the application corrects them on startup.
