# Download Scheduler Specification

## Purpose

Defines in-process scheduling gated by persisted config, manual triggering, run-state surfacing, and the concurrent-run guard.

## Requirements

### Requirement: Schedule Is Gated by Persisted Config

The scheduler MUST only fire automated runs when `download_schedule_config.enabled` is true, and MUST use the persisted cadence/time to decide when to fire.

#### Scenario: Schedule disabled
- GIVEN `download_schedule_config.enabled = 0`
- WHEN the configured time/cadence elapses
- THEN the scheduler MUST NOT start a run

#### Scenario: Schedule enabled and due
- GIVEN `download_schedule_config.enabled = 1` and the configured time has arrived
- WHEN the in-process scheduler ticks
- THEN the scheduler MUST start a run with `trigger="scheduled"`

### Requirement: Manual Trigger Path

The system MUST expose a manual trigger that starts a run immediately, independent of the schedule's configured time.

#### Scenario: User triggers manually
- GIVEN no scheduled run is currently due
- WHEN the user invokes the manual trigger
- THEN the system MUST start a run with `trigger="manual"`

### Requirement: Next-Run/Last-Run/Last-Status Surfaced

The system MUST persist and expose `next_run_at`, `last_run_at`, and `last_run_status` so the UI can display scheduler state without inferring it from log history.

#### Scenario: After a run completes
- GIVEN a scheduled or manual run has just completed
- WHEN the system updates `download_schedule_config`
- THEN `last_run_at` and `last_run_status` MUST reflect that run
- AND `next_run_at` MUST reflect the next scheduled occurrence (if enabled)

#### Scenario: No run has ever occurred
- GIVEN a freshly initialized `download_schedule_config`
- WHEN the UI requests scheduler status
- THEN the system MUST return a state indicating "no runs yet" rather than null/garbage values that could be misread as a failure

### Requirement: Concurrent-Run Guard

The system MUST NOT start a new run (scheduled or manual) while a run is already in progress.

#### Scenario: Scheduled tick fires during an active manual run
- GIVEN a manual run is currently in progress
- WHEN the scheduler's tick determines a scheduled run is due
- THEN the scheduler MUST skip starting a new run
- AND MUST record/log that the tick was skipped due to an in-progress run

#### Scenario: Manual trigger invoked during an active run
- GIVEN a run (scheduled or manual) is currently in progress
- WHEN the user invokes the manual trigger
- THEN the system MUST reject the new trigger
- AND MUST surface to the caller that a run is already in progress

### Requirement: Scheduled Runs Require a Running Bridge

Because scheduling is in-process only in this change (auto-start-on-login is deferred to a separate follow-up), the schedule UI MUST surface that scheduled runs only fire while the bridge process is running. There is NO missed-run-after-reboot guarantee in this change.

#### Scenario: UI states the running-bridge requirement
- GIVEN the schedule configuration panel is displayed
- WHEN the user views or enables the schedule
- THEN the UI MUST surface that scheduled runs require the bridge to be running (e.g. an explicit note that a missed scheduled time will NOT auto-catch-up after a full quit or reboot)

#### Scenario: Missed time after a quit is not auto-recovered
- GIVEN the bridge process was not running at the configured scheduled time (it was quit or the machine had rebooted)
- WHEN the bridge is next launched after that time has already passed
- THEN the system MUST NOT silently guarantee the missed run was executed
- AND the schedule state surfaced to the UI MUST remain truthful about the last/next run rather than implying the missed run happened

### Requirement: Bounded Shutdown Drain and Run Max-Duration Guard

The scheduler MUST NOT block application shutdown for the lifetime of a long run, and MUST NOT allow a single wedged run to hold the concurrent-run guard indefinitely.

#### Scenario: Shutdown during an active run drains within a bounded timeout
- GIVEN a run is actively in progress when the application begins shutting down
- WHEN `Stop()` is invoked
- THEN the scheduler MUST cancel the active run's context and wait at most a fixed bounded drain timeout, then abandon the run
- AND the abandoned run's `download_runs` row (still non-terminal) MUST be reconciled to `interrupted` on the next startup before the scheduler starts
- AND shutdown MUST NOT block for the full remaining duration of the run

#### Scenario: A run exceeding its maximum duration releases the guard
- GIVEN a run whose JD/hoster polling is wedged and does not finish within the configured run maximum duration
- WHEN the run-level maximum-duration deadline elapses
- THEN the system MUST cancel the run, finalize its `download_runs` row with a terminal status reflecting the timeout, and RELEASE the concurrent-run guard
- AND subsequent scheduled or manual triggers MUST be able to start a new run (the guard is not held forever)
