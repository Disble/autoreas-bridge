# Delta for Observability

## ADDED Requirements

### Requirement: An Activity Audit Row Distinguishes Observation From Report

The activity log records what the bridge observed. That guarantee is unchanged: a row's own
instant MUST remain the instant the bridge observed the change, and the correlation id
derived from it MUST NOT move.

Because a change may also carry an instant reported by its source, the row MUST be able to
retain that reported instant separately, as a nullable value. The two instants MUST NOT be
conflated in either direction: the reported instant MUST NOT replace the observation instant,
and the observation instant MUST NOT be presented as the source's own report.

An audit row whose change carried no reported instant MUST remain readable, with the new
value absent rather than defaulted to the observation instant — an absent report and a report
that happens to equal the observation instant are different facts.

This requirement complements "Activity Log Remains Untouched By Runtime-Event Persistence"
rather than modifying it; the distinct-table, retention-cap and navigation-telemetry
guarantees there are unaffected.

#### Scenario: The observation instant survives a reported instant
- GIVEN a change that carries a reported instant earlier than the bridge observed it
- WHEN its audit row is persisted
- THEN the row's own instant MUST be the observation instant
- AND the correlation id derived from it MUST be unchanged
- AND the reported instant MUST be retained separately

#### Scenario: An unreported change keeps an absent value
- GIVEN a change that carries no reported instant
- WHEN its audit row is persisted
- THEN the retained reported value MUST be absent
- AND it MUST NOT be defaulted to the observation instant

#### Scenario: Existing rows stay readable
- GIVEN audit rows written before the retained reported value existed
- WHEN they are read
- THEN they MUST read successfully with the value absent
