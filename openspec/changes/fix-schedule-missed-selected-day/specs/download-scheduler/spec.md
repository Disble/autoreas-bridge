# Delta for download/scheduler

## ADDED Requirements

### Requirement: Global Toast Missed-Notice Delivery

An eligible missed selected-day notice MUST open as a persistent global HeroUI Toast on app startup and MUST remain mirrored in the Downloads SchedulePanel from the same backend-owned notice state. `Run now` and `Ignore` from either surface MUST converge after the next status refresh. An accepted `Run now` MUST dismiss decision UI immediately on both surfaces. A rejected action MUST keep the notice available and MUST surface safe feedback.

#### Scenario: Global Toast opens first and Downloads mirrors
- GIVEN today is an eligible missed selected local date
- WHEN the app finishes opening
- THEN a global Toast MUST show the notice first
- AND Downloads MUST show the same notice state

#### Scenario: Accepted or rejected actions stay synchronized
- GIVEN the missed notice is visible as a global Toast and in Downloads
- WHEN the user triggers `Run now` or `Ignore` from either surface
- THEN both surfaces MUST converge to the same state after refresh
- AND a rejected action MUST leave the notice available with safe feedback

### Requirement: Terminal Run-Now Failure Follow-up

If `Run now` for a missed selected date ends in terminal failure, the system MUST keep that date unresolved and MUST present exactly one global failure Toast per local date and session. The Toast MUST offer `Open Downloads` and `Ignore this date`. It MUST NOT offer `Run now`.

#### Scenario: Terminal failure produces one deduplicated global Toast
- GIVEN `Run now` was accepted for today's missed selected date
- WHEN the run ends in terminal failure and status refresh completes
- THEN the system MUST show one global failure Toast with `Open Downloads` and `Ignore this date`
- AND it MUST keep the date unresolved without exposing `Run now`

## MODIFIED Requirements

### Requirement: Startup Missed Selected-Day Notice

At startup after today's configured local due time, the system MUST surface one missed-schedule decision notice only when the current local date is selected, the bridge was not running at the due boundary, automatic downloads are disabled, and that selected local date remains unresolved. `Run now` MUST NOT auto-start without user action. A selected local date is resolved only by a current-date scheduled completion, a successful `Run now`, or a persisted `Ignore` for that same local ISO date. Success MUST settle the date, close global and Downloads decision UI, and rely on the existing download Notifier completion behavior. The system MUST NOT emit a duplicate global success card. This policy SHALL remain limited to startup missed-date notification behavior.

(Previously: the notice was specified as a single in-app startup notice without global Toast mirrored delivery or notifier-only success follow-up.)

#### Scenario: Eligible startup shows one decision notice
- GIVEN today is selected, startup happens after today's local due time, the bridge was closed at that boundary, and today is unresolved
- WHEN startup evaluation completes
- THEN the system MUST show one missed-schedule decision notice
- AND it MUST NOT auto-run the download

#### Scenario: Ignore settles only today and keeps factual run history
- GIVEN today's missed notice is visible
- WHEN the user chooses `Ignore`
- THEN the system MUST settle only today's local ISO date and persist the next strict-future selected run
- AND it MUST preserve factual `last_run_at` and `last_run_status`

#### Scenario: Successful Run now closes decision UI without extra success card
- GIVEN today's missed notice is visible
- WHEN the user chooses `Run now` and the run succeeds
- THEN the system MUST settle today's date and close global plus Downloads decision UI
- AND completion MUST use the existing download Notifier without a duplicate global success card

#### Scenario: Existing suppressed and rejected cases stay unchanged
- GIVEN the candidate case is an unselected date, exact boundary startup, alive process at the due boundary, already settled date, stale older date, automatic-download configuration, timing-change recalculation, or Windows startup suppression case
- WHEN missed-notice eligibility is evaluated
- THEN the system MUST keep the notice suppressed
- AND it MUST preserve the current rejection outcome for that case

### Requirement: Next-Run/Last-Run/Last-Status Surfaced

The system MUST persist and expose `next_run_at`, `last_run_at`, and `last_run_status` from actual scheduler execution facts. An unresolved missed-date notice MUST remain separate notice state and MUST NOT rewrite factual last-run fields. After `Ignore`, `next_run_at` MUST move to the next selected strict-future local date. After a successful `Run now`, persisted run facts MUST describe that actual run. A separately eligible missed selected date tomorrow MAY surface again.

(Previously: the requirement covered date settlement and next-run advancement without the explicit tomorrow re-eligibility rule.)

#### Scenario: Tomorrow may surface after today's ignore
- GIVEN today's selected missed date was ignored and tomorrow is also a selected date
- WHEN tomorrow becomes separately eligible after its own due boundary
- THEN the system MAY show a new missed notice for tomorrow
- AND today's ignore MUST NOT pre-settle tomorrow
