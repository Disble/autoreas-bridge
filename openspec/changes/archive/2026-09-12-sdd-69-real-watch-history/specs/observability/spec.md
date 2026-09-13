# Delta for Observability

## MODIFIED Requirements

### Requirement: Activity Log Remains Untouched By Runtime-Event Persistence

The persisted runtime-event log MUST be a distinct table from `activity_log`. This change MUST
NOT modify, read, or otherwise conflate `activity_log` with the persisted runtime-event log.
`activity_log` MUST NOT receive the four navigation-telemetry action types
(`anime_folder_opened`, `anime_page_opened`, `anime_folder_copied`, `anime_page_copied`); those
events MUST instead be written to the persisted runtime-event log under `domain = "anime"`.
`activity_log` MUST be subject to a retention cap, pruned on the same cadence as other capped
bridge tables.
(Previously: `activity_log`'s existing per-anime audit-trail behavior was stated as entirely
unchanged, it received all activity action types including navigation telemetry, and it carried
no retention policy.)
(Reason: SDD-69 relocates navigation telemetry to the persisted runtime-event log and gives
`activity_log` the retention cap it was the only bridge table to lack. The distinct-table
guarantee between `activity_log` and the runtime-event log is unaffected.)

#### Scenario: Activity log is neither written nor read by this change

- GIVEN the persisted runtime-event log is active
- WHEN a runtime event is logged and persisted
- THEN no row is written to or read from `activity_log` as part of that persistence
- AND `activity_log`'s state-change audit-trail behavior for non-navigation actions is unchanged

#### Scenario: Navigation telemetry no longer lands in activity_log

- GIVEN a user opens or copies an anime's folder or page
- WHEN the resulting telemetry event is recorded
- THEN it MUST be written to the persisted runtime-event log under `domain = "anime"`
- AND no row MUST be written to `activity_log` for that event

#### Scenario: Activity log is pruned beyond its retention cap

- GIVEN `activity_log` has accumulated rows beyond its configured retention cap
- WHEN pruning runs at its configured cadence
- THEN the oldest rows beyond the cap MUST be removed
- AND the table MUST NOT exceed its cap by more than the writes accumulated within one prune
  cycle
