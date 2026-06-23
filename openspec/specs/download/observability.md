# Download Observability Specification

## Purpose

Defines how download runs integrate with the existing SDD-20 structured logging contract, the event bus, durable run history, and the status taxonomy — including JD-offline manual-link persistence.

## Requirements

### Requirement: Structured Logging With Domain and Correlation

The system MUST emit log entries through the existing `logger.Logger` `LogEntry` contract with `Domain="download"` and `CorrelationID` set to the run's `run_id` for every significant step of a run.

#### Scenario: Episode-level event is logged
- GIVEN a run is processing an anime's episode
- WHEN the system downloads or skips that episode
- THEN the system MUST emit a `LogEntry` with `Domain="download"`, `CorrelationID=run_id`, and `EntityID` set to the anime identifier

#### Scenario: Run-level start/end is logged
- GIVEN a run starts or finishes
- WHEN the system transitions run state
- THEN the system MUST emit a corresponding `LogEntry` with the same `CorrelationID`

### Requirement: Download Events on the Event Bus

The system MUST publish `download.*` events on the existing `events.Bus` for episode availability, completion, and failure, so other components can subscribe without new coupling.

#### Scenario: Episode becomes available
- GIVEN the orchestrator determines an episode needs downloading
- WHEN it enqueues that episode
- THEN the system MUST publish a `download.episode_available` event

#### Scenario: Download completes or fails
- GIVEN an enqueued episode either completes or times out
- WHEN that outcome is determined
- THEN the system MUST publish `download.completed` or `download.failed` accordingly

### Requirement: Durable Run History

The system MUST persist a `download_runs` row per run, durable across application restarts, independent of the in-memory log ring buffer.

#### Scenario: Run history survives restart
- GIVEN a run completed before the application was restarted
- WHEN the UI requests run history after restart
- THEN the previously completed run MUST still be retrievable from `download_runs`

#### Scenario: Ring buffer is not the source of truth for history
- GIVEN the in-memory log ring buffer has been overwritten (exceeded its bounded capacity)
- WHEN the UI requests historical run status
- THEN the system MUST still answer correctly from `download_runs`, not from the ring buffer

### Requirement: Run History Is Bounded (Retention)

The `download_runs` table MUST be bounded: the system MUST retain only the most recent 200 runs, pruning older rows when a run is finalized, so the table can never grow unbounded across the application's lifetime. No other feature reads this table and writes occur at most ~once per day (scheduled) or on manual trigger, so pruning on finalize is not on a hot path; concurrent reads remain available (WAL).

#### Scenario: Table stays bounded after exceeding the cap
- GIVEN 200 runs already exist in `download_runs`
- WHEN a new run is finalized (the 201st run)
- THEN the system MUST prune the oldest run(s) so that `download_runs` contains at most 200 rows
- AND the most recently finalized run MUST be retained
- AND the single oldest prior run MUST no longer be present

#### Scenario: Pruning does not affect the current run's persistence
- GIVEN the run-history table is at its 200-row cap
- WHEN a new run is finalized
- THEN the newly finalized run MUST be readable from `download_runs` after the prune
- AND the prune MUST NOT delete the run being finalized

### Requirement: Run Status Taxonomy

The system MUST classify each run's terminal status as one of: `ok`, `partial`, `error`, `jd_offline`, `no_animes_today`, or `interrupted`. While a run is in progress its status MUST be the concrete provisional value `running` (a defined non-terminal string, NOT NULL and NOT an undefined value). `running` is the only non-terminal status.

#### Scenario: All animes succeed
- GIVEN every eligible anime in a run was evaluated without failure
- WHEN the run completes
- THEN the system MUST record `status="ok"`

#### Scenario: Mixed success and failure
- GIVEN at least one anime succeeded and at least one anime failed
- WHEN the run completes
- THEN the system MUST record `status="partial"`

#### Scenario: No eligible animes today
- GIVEN no animes are scheduled/active for today's weekday
- WHEN the run executes
- THEN the system MUST record `status="no_animes_today"` rather than `ok` or `error`

#### Scenario: JDownloader is offline for the whole run
- GIVEN `ListDevices()` proves JD is unreachable at run start
- WHEN the run executes
- THEN the system MUST record `status="jd_offline"`

#### Scenario: Run row is provisional while in progress
- GIVEN a run has just been opened
- WHEN `OpenRun` persists the row
- THEN the row's `status` MUST be the concrete provisional string `running` (never NULL or undefined)
- AND `finished_at_ms` MUST be NULL until the run reaches a terminal status

### Requirement: Crash-Zombie Run Reconciliation

Any `download_runs` row left non-terminal (`finished_at_ms IS NULL`) after a crash, kill, or abandoned shutdown drain MUST be finalized as `interrupted` at startup, before the scheduler starts, so no row remains permanently stuck in `running`.

#### Scenario: Non-terminal run at boot is finalized as interrupted
- GIVEN a `download_runs` row with `status="running"` and `finished_at_ms IS NULL` left over from a previous process that crashed or was killed
- WHEN the application starts up
- THEN the system MUST finalize that row with `status="interrupted"` (and a `finished_at_ms`) BEFORE the scheduler starts
- AND the system MUST NOT leave the row in the `running` state

#### Scenario: Reconciliation runs before scheduling
- GIVEN one or more non-terminal `download_runs` rows exist at boot
- WHEN startup proceeds
- THEN reconciliation to `interrupted` MUST complete before the scheduler can open a new run, so a fresh run is never confused with a stale zombie

### Requirement: Skip Accounting in Run Counters

The system MUST account for skipped animes (Tipo 1/2, missing `pagina`/`carpeta`, unsupported or disabled site) in a dedicated `download_runs.skipped_count` column, separate from `animes_checked`. `animes_checked` MUST count only animes that were actually evaluated (not skipped). The per-anime skip reason MUST be recoverable from the structured log (a `download.skipped` entry with a `skipReason` in `Metadata`), even though the run row stores only the aggregate count.

#### Scenario: Skipped animes increment skipped_count, not animes_checked
- GIVEN a run with 5 today-active animes, of which 2 are skipped (one Tipo=1, one missing `carpeta`) and 3 are evaluated
- WHEN the run completes
- THEN `download_runs.skipped_count` MUST be 2
- AND `animes_checked` MUST be 3 (only the evaluated animes)
- AND each skip MUST also be recoverable as a `download.skipped` structured log entry carrying its `skipReason`

### Requirement: JD-Offline Manual Links Persistence

When a run determines JD is offline, the system MUST persist the manual download links it would have enqueued so the UI can retrieve them later. The persisted shape MUST be the typed `contracts.ManualLink` contract — `{anime, episode, links[]}` — so backend persistence and the frontend run-detail view assert the same shape. The persisted array MUST be bounded to a sane limit (no unbounded growth from a pathological scrape).

#### Scenario: JD offline during a run with eligible episodes
- GIVEN JD is offline and at least one episode was identified as needing download
- WHEN the run records its `jd_offline` outcome
- THEN the system MUST persist the manual links for those episodes against the run as a JSON array of `contracts.ManualLink` (`{anime, episode, links[]}`)
- AND the UI MUST be able to retrieve those links from the run's detail view using that same typed shape
