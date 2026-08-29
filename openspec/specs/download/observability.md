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

A skip is a PRE-EVALUATION exclusion: the anime was never looked up online because it is out of scope or misconfigured. It MUST NOT be conflated with an "up to date" outcome (see "Up-to-Date Accounting in Run Counters"), where the anime WAS evaluated and simply needed no download.

#### Scenario: Skipped animes increment skipped_count, not animes_checked
- GIVEN a run with 5 today-active animes, of which 2 are skipped (one Tipo=1, one missing `carpeta`) and 3 are evaluated
- WHEN the run completes
- THEN `download_runs.skipped_count` MUST be 2
- AND `animes_checked` MUST be 3 (only the evaluated animes)
- AND each skip MUST also be recoverable as a `download.skipped` structured log entry carrying its `skipReason`

### Requirement: Up-to-Date Accounting in Run Counters

The system MUST account for evaluated animes that needed no download in a dedicated `download_runs.up_to_date_count` column. An anime is "up to date" when it was evaluated but no download was triggered because either (a) the highest online episode number was not greater than the on-disk video-file count (`NeedsDownload` is false), or (b) the season was already complete on disk (`TotalCap` equals the on-disk count, short-circuiting the online lookup).

`up_to_date_count` is a SUBSET of `animes_checked`: an up-to-date anime WAS evaluated, so it MUST also be counted in `animes_checked`. It MUST NOT be counted in `skipped_count`, because it was not a pre-evaluation exclusion. The per-anime up-to-date outcome MUST be recoverable from the structured log (a `download.up_to_date` entry whose `Metadata.reason` is `no_new_episode` or `season_complete_on_disk`), even though the run row stores only the aggregate count.

#### Scenario: Up-to-date animes increment up_to_date_count within animes_checked
- GIVEN a run with 3 today-active, well-configured animes, of which 1 has a new episode to download and 2 are already up to date (one with nothing newer online, one with the season already complete on disk)
- WHEN the run completes
- THEN `download_runs.up_to_date_count` MUST be 2
- AND `animes_checked` MUST be 3 (all three were evaluated, including the two up-to-date)
- AND `skipped_count` MUST be 0
- AND each up-to-date outcome MUST be recoverable as a `download.up_to_date` structured log entry carrying its `reason`

### Requirement: JD-Offline Manual Links Persistence

When a run determines JD is offline, the system MUST persist the manual download links it would have enqueued so the UI can retrieve them later. The persisted shape MUST be the typed `contracts.ManualLink` contract — `{anime, episode, links[]}` — so backend persistence and the frontend run-detail view assert the same shape. The persisted array MUST be bounded to a sane limit (no unbounded growth from a pathological scrape).

#### Scenario: JD offline during a run with eligible episodes
- GIVEN JD is offline and at least one episode was identified as needing download
- WHEN the run records its `jd_offline` outcome
- THEN the system MUST persist the manual links for those episodes against the run as a JSON array of `contracts.ManualLink` (`{anime, episode, links[]}`)
- AND the UI MUST be able to retrieve those links from the run's detail view using that same typed shape

### Requirement: Download-Start Probe Timeline Is Persisted

`[Slice 1 — items 1 and 1b]`

The system MUST persist, once per hoster attempt, the timeline of the filesystem probes that
decide whether the downloader began transferring: an ordered array of `{elapsedMs, found}` entries,
where `elapsedMs` is the milliseconds elapsed since that attempt's enqueue and `found` reports whether
transfer evidence existed at that instant.

The timeline MUST be persisted on BOTH outcomes of the detect phase — on the existing
`download.detect_start_failed` entry, and on a new `info`-level entry for the successful path.
The successful path currently reaches the in-memory event bus only, so `download.episode_downloading`
has produced ZERO persisted rows over the system's entire lifetime; the near-miss distribution it
should carry has never been observable.

**Decision enabled:** is a start-detection miss caused by the probe SCHEDULE or by the probe
PREDICATE? Successes clustering on the last probe mean the window is too short (widen the
schedule). Every probe reporting `found:false` while the file demonstrably landed means the
evidence predicate is wrong (change the predicate). No other recorded field separates those two
defects, and they require opposite fixes.

#### Scenario: Failed detect phase persists the probe timeline

- GIVEN a hoster attempt whose probes never observe transfer evidence
- WHEN the detect phase gives up
- THEN the persisted `download.detect_start_failed` entry MUST carry the ordered probe array
- AND every entry's `found` MUST be `false`

#### Scenario: Successful detect phase persists the probe timeline

- GIVEN a hoster attempt whose probe observes transfer evidence
- WHEN the detect phase reports that the transfer started
- THEN the system MUST persist an `info`-level entry carrying the ordered probe array
- AND the final entry's `found` MUST be `true`
- AND that entry MUST reach the durable structured log, not the event bus alone

#### Scenario: Exactly one entry per attempt, never one per probe

- GIVEN a hoster attempt that runs its full probe schedule
- WHEN the detect phase terminates by either outcome
- THEN the system MUST persist exactly ONE entry for the whole detect phase
- AND MUST NOT persist one entry per probe

#### Scenario: Probe timestamps advance across the schedule

- GIVEN a hoster attempt whose probes are separated in time
- WHEN the probe timeline is persisted
- THEN the recorded `elapsedMs` values MUST be strictly increasing
- AND MUST be relative to that attempt's enqueue, not absolute timestamps duplicating the entry's
  own occurrence time

---

### Requirement: Every Package Removal Is Recorded With the Status That Justified It

`[Slice 1 — item 2]`

Removing downloader packages by destination is destructive and irreversible. The system MUST
persist a `warn`-level `download.jd_removed` entry for EVERY such removal, including removals that
succeed. Today only a FAILING removal is recorded, so a successful destructive removal leaves no
persisted trace at all — which is precisely how two removals of finished work went unrecorded.

Each entry MUST carry:

| Field | Decision it enables |
|---|---|
| `stage` | Which of the four removal sites destroys finished work. |
| `statusKnown` | Was the removal evidence-based, or blind? |
| `verdict`, crawl online/offline counts, package count, link count, `anyFinished`, `anyRunning` | Was this destructive removal justified? `anyFinished:true` beside a `dead` verdict is the exact signature of destroying completed work. |

`stage` MUST take a DISTINCT value at each of the four removal sites, so a reader can tell which
site fired without reconstructing control flow.

The removal that follows a failed status query has no status by construction. It MUST record
`statusKnown:false`. It MUST NOT omit the status fields silently, and MUST NOT record zeroed
counts as if they had been observed — a zero that was never measured and a zero that was measured
lead to opposite conclusions.

The entry MUST carry aggregate counts, booleans and the verdict ONLY. The status contract
available at this layer carries no package names, file names, URLs or destination paths, so this
requirement MUST NOT promise identity the system cannot deliver.

#### Scenario: A successful removal is recorded

- GIVEN a package removal that completes without error
- WHEN the removal is performed
- THEN the system MUST persist a `warn`-level `download.jd_removed` entry
- AND that entry MUST carry the `stage` of the removal site that fired

#### Scenario: A removal with no observed status records that it was blind

- GIVEN a removal that follows a failed status query, so no status was observed
- WHEN the removal is performed
- THEN the entry MUST record `statusKnown:false`
- AND MUST NOT report status counts as though they had been measured

#### Scenario: Destroying finished work is recoverable from the persisted log alone

- GIVEN a status that reports finished work while the verdict is `dead`
- WHEN the removal is performed
- THEN the entry MUST record both `anyFinished:true` and the `dead` verdict
- AND a reader MUST be able to reach that conclusion without any record external to the system

#### Scenario: The removal entry claims no identity it cannot observe

- GIVEN any package removal
- WHEN the entry is persisted
- THEN it MUST NOT contain package names, file names, link URLs or destination paths

---

### Requirement: Every Hoster Attempt Is Recorded, Success Included

`[Slice 1 — item 4]`

The system MUST persist exactly one `info`-level `download.hoster_attempt` entry per hoster
attempt, carrying the `hoster`, its zero-based `attemptIndex` in the resolved priority order, and
the attempt's `outcome`. The dead and timeout branches are logged today; the SUCCESS branch is
not, so the ledger has a hole exactly where the credited attempt sits.

**Decision enabled:** which hoster to demote in the priority list, and whether the first hoster
fails systematically (the order is wrong) or the fallback is quietly doing all the work. Comparing
this ledger against the hoster credited on the episode-success entry is what exposes a fallback
credited for another hoster's bytes.

#### Scenario: A successful attempt is recorded

- GIVEN a hoster attempt whose outcome is success
- WHEN the attempt terminates
- THEN the system MUST persist one `download.hoster_attempt` entry carrying `hoster`,
  `attemptIndex` and a success `outcome`

#### Scenario: One entry per attempt across a fallback chain

- GIVEN an episode whose first hoster fails and whose second hoster succeeds
- WHEN the episode finishes
- THEN the system MUST persist exactly two `download.hoster_attempt` entries
- AND their `attemptIndex` values MUST be `0` and `1` in that order

#### Scenario: The ledger is additive to the failure taxonomy

- GIVEN a hoster attempt that fails
- WHEN the attempt is recorded
- THEN the existing failure-taxonomy entries MUST remain unchanged in level, event type and
  `failureKind`
- AND the ledger entry MUST be an ADDITIONAL record, never a replacement

---

### Requirement: Episode Terminal Exit Is Recorded

`[Slice 2 — item 3]`

The system MUST record, on both the episode-success entry (`download.episode_downloaded`) and the
episode-level failure entry (`download.failed`), which terminal point produced the outcome
(`exit`), the credited `hoster`, its zero-based `attemptIndex`, the on-disk episode count captured
before the first attempt (`baseline`), and the on-disk count observed at the terminal point
(`observed`).

(Previously: the enum was declared closed at SEVENTEEN values, row 2 was labelled "(no rename)" and
row 4 "(rename performed)", and the prose stated that `exit` settles "was the file renamed" because
the entry-guard success skipped completion handling entirely. All three become false once every
success path completes the episode and a post-grace disk-confirmed success exists.)

**Decision enabled by `exit`:** was the success OBSERVED by the credited attempt, or merely found
already on disk when that attempt began? This is the central question the field exists to answer,
and no other recorded field answers it. `exit` no longer settles "was the file renamed" — every
success path now runs completion handling (see the `download-orchestration` capability's "Every
Success Path Completes the Episode"). What `exit` separates is WHERE the success was observed:
already on disk when the attempt began, confirmed by the post-grace disk re-check, or observed by
the completion poll.

**Decision enabled by `baseline` and `observed`:** is the classifier declaring finished downloads
dead, and how often? A `dead`-producing `exit` recorded beside an `observed` count that had
already advanced past `baseline` is that defect, visible after the fact. This is what sizes the
follow-up fix.

`exit` MUST be a CLOSED enum with ONE DISTINCT VALUE per terminal point below — EIGHTEEN values,
all distinct. Indicative names are illustrative; design owns final naming. The DISTINCTIONS are
mandatory.

| # | Terminal point | Kind | Indicative value |
|---|---|---|---|
| 1 | Watch entry, episode counter dependency absent | timeout | `counter_unavailable` |
| 2 | Watch entry guard, disk already ahead of baseline | success | `disk_ahead_at_entry` |
| 3 | Pre-check classified the hoster dead | dead | `precheck_dead` |
| 4 | Completion poll observed the count advance | success | `fs_poll_confirmed` |
| 5 | Completion poll reached its deadline | timeout | `fs_poll_deadline` |
| 6 | Completion poll interrupted by cancellation | timeout | `cancelled_during_poll` |
| 7 | Post-grace, downloader client absent, first hoster | dead | `grace_client_absent_first` |
| 8 | Post-grace, downloader client absent, fallback hoster | timeout | `grace_client_absent_fallback` |
| 9 | Post-grace status query error, first hoster | dead | `grace_query_error_first` |
| 10 | Post-grace status query error, fallback hoster | timeout | `grace_query_error_fallback` |
| 11 | Post-grace status classified dead | dead | `grace_classified_dead` |
| 12 | Post-grace, no positive signal, first hoster | dead | `grace_no_signal_first` |
| 13 | Post-grace, no positive signal, fallback hoster | timeout | `grace_no_signal_fallback` |
| 14 | Post-grace disk re-check confirmed the episode landed | success | `grace_disk_confirmed` |
| 15 | Pipeline: downloader unavailable, no attempt made | — | `jd_unavailable` |
| 16 | Pipeline: cancelled before an attempt started | — | `cancelled_before_attempt` |
| 17 | Pipeline: enqueue error on the last attempted hoster | — | `enqueue_error` |
| 18 | Pipeline: no hosters resolved, no attempt ever ran | — | `no_hosters` |

Four constraints on that enum, each of which a naive implementation violates:

1. **Values 8, 10 and 13 MUST NOT collapse into values 7, 9 and 11.** They are separate returns
   reached under a different hoster position and produce a different kind. Folding the fallback
   mirrors into an undifferentiated `timeout` destroys exactly the discriminator this requirement
   exists to provide.
2. **Values 5 and 6 MUST NOT share one value.** They are produced by one composite condition
   today, but a user pressing Stop and a genuine poll-deadline expiry are different decisions.
3. **The post-grace proceed-and-continue path MUST NOT be stamped with any `exit`.** That path
   returns a sentinel outcome whose value is never surfaced; stamping it would make the field lie.
   The attempt continues, and its eventual terminal point supplies the recorded `exit`.
4. **Value 14 MUST NOT reuse value 2.** Both report a file the attempt never watched arrive, but
   one was already on disk BEFORE the attempt began and the other landed DURING it. Collapsing them
   makes a working post-grace re-check indistinguishable from a disk that was already ahead, which
   is the exact comparison that tells whether the fix is doing anything.

When the hoster loop exhausts every hoster, the recorded `exit` MUST be the LAST attempt's
terminal value, not a synthetic "exhausted" value — the reader's question is *how* the last
attempt ended.

#### Scenario: Observed success is distinguishable from success found already on disk

- GIVEN an attempt whose success came from the entry guard because the disk count was already
  ahead of the baseline
- WHEN the episode success is recorded
- THEN `exit` MUST differ from the value recorded when the completion poll confirmed the advance
- AND the two cases MUST be distinguishable from `exit` alone, without reading any other field

#### Scenario: A post-grace disk-confirmed success is distinguishable from both other successes

- GIVEN three attempts that succeed — one because the disk was already ahead at entry, one because
  the post-grace disk re-check found the episode, one because the completion poll observed the
  advance
- WHEN each records its terminal exit
- THEN the three entries MUST record THREE DIFFERENT `exit` values

#### Scenario: Fallback timeouts are distinguishable from their first-hoster twins

- GIVEN two attempts that reach the same post-grace condition, one as the first hoster and one as
  a fallback
- WHEN each records its terminal exit
- THEN the two entries MUST record DIFFERENT `exit` values

#### Scenario: Cancellation is distinguishable from a poll deadline

- GIVEN one episode stopped by user cancellation during the completion poll and one whose
  completion poll ran to its deadline
- WHEN each records its terminal exit
- THEN the two entries MUST record DIFFERENT `exit` values

#### Scenario: The proceed-and-continue sentinel carries no exit

- GIVEN a post-grace status that reports a positive signal, so the attempt proceeds
- WHEN that evaluation returns
- THEN no `exit` MUST be persisted for that transition
- AND the recorded `exit` for the episode MUST come from the attempt's eventual terminal point

#### Scenario: Episode failure carries the same discriminators

- GIVEN an episode that failed on every hoster
- WHEN the episode-level failure is recorded
- THEN the entry MUST carry `exit`, `hoster`, `attemptIndex`, `baseline` and `observed`
- AND its existing `failureKind` MUST be unchanged

#### Scenario: A pre-attempt exit is distinguishable from an exhausted chain

- GIVEN an episode for which no hoster was ever attempted
- WHEN the failure is recorded
- THEN `exit` MUST identify the pre-attempt reason
- AND MUST differ from the value recorded when hosters were attempted and all failed

---

### Requirement: The Observed Disk Count Is Recorded and Never Acted On

`[Slice 2 — item 3]`

The RECORDED `observed` field is forensic evidence, not an input. The system MUST record it on the
episode entry and MUST NEVER read that recorded field back: no branch, guard, loop condition, early
return, verdict, failure classification, run counter or event payload may consult it.

A DELIBERATE, SEPARATE filesystem reading taken for a control-flow decision is not this field and
is not forbidden by this requirement. The post-grace disk re-check (see the
`download-orchestration` capability's "Filesystem Is Success Truth, JD Status Is Failure Truth")
takes its own fresh reading and MUST NOT read the recorded `observed` value.

(Previously: the requirement forbade ALL control flow from reacting to an advanced disk count, and
its second scenario required a dead verdict over an advanced count to keep that verdict AND still
perform the package removal. That mandated the very defect the instrumentation was built to
measure. The intent was correct within the instrumentation change — recording evidence must not
change behavior — but it was authored as an unconditional mandate rather than scoped to that
change, so the deployed spec read as a permanent instruction to keep the bug.)

Keeping the recorded field non-causal is what makes the fix verifiable: the measurement stays
independent of the behavior it measures, so a before/after comparison over the same recorded field
means something. Wiring the recorded field into control flow would collapse instrument and subject
into one.

#### Scenario: No control flow reads the observed count

- GIVEN two attempts that reach the SAME terminal point with different on-disk counts recorded as
  `observed`
- WHEN each attempt terminates
- THEN both MUST produce the same verdict, the same failure classification and the same run
  counters
- AND ONLY the recorded `observed` value MUST differ between the two persisted entries

#### Scenario: A dead verdict over an advanced disk count is corrected, and both counts recorded

- GIVEN a hoster attempt with no positive JD signal while the on-disk count has already advanced
  past the baseline
- WHEN the outcome is determined
- THEN the system MUST take a fresh filesystem reading BEFORE producing any dead verdict
- AND the attempt MUST terminate in success, with `baseline`, `observed` and a success-producing
  `exit` recorded
- AND that decision MUST come from the fresh reading, never from the recorded `observed` field

---

### Requirement: Forensic Instrumentation Changes No Behavior

The forensic instrumentation is instrumentation only. No hoster verdict, no success or failure
decision, no run counter, no persisted run row and no event-bus payload may change value BECAUSE OF
the instrumentation.

(Previously: "The change is instrumentation only… may change value as a result of it", over "any
download run replayed before and after this change". Once merged and archived, "this change" has no
antecedent, so the requirement read as forbidding every later behavior change in this area.)

The prohibition is on the INSTRUMENTATION causing a change, not on the system's behavior ever
changing. A behavior change mandated by a separate requirement is not a violation of this one.

The structural half of this rule — that the anime run-outcome structure MUST NOT gain fields — is
strong enough to stand on its own and is stated separately below.

#### Scenario: Verdicts, counters and run rows are unchanged by the instrumentation

- GIVEN any download run replayed with and without the forensic instrumentation, and with no other
  difference
- WHEN the run completes
- THEN every hoster verdict, every episode success/failure decision, every run counter and the
  persisted run row MUST be identical
- AND ONLY the persisted event stream MUST differ, by addition

---

### Requirement: The Anime Run-Outcome Structure Is Not Widened

No field introduced by this change may be added to the anime run-outcome structure
(`animeRunOutcome`, `internal/download/service.go`). The prohibition is STRUCTURAL, not a coupling
convention, and rests on four independent reasons — strongest first, each verified against source:

1. **It is one type, not two.** `internal/download/service.go` declares
   `type animeProgressDelta = animeRunOutcome`: a type ALIAS, not a defined type. The two names
   denote the SAME type, with 24 non-test `animeProgressDelta` references across `service.go`,
   `service_pipeline.go` and `service_single_anime.go`. Widening the outcome therefore silently
   widens the LIVE progress-delta channel threaded through the progress fan-out that feeds the UI.
   A forensic per-attempt field would leak straight into user-facing progress payloads, and
   nothing in either name warns of it.
2. **The audience is wrong.** The struct's own field comments state its purpose: the first and
   last downloaded-episode numbers exist "so a notification row can say \"Episodes 14-16\" instead
   of only \"3 episodes\"". It builds user-facing notification rows. Per-attempt forensic data has
   a different audience and a different lifetime.
3. **Collision avoidance.** The in-flight notification-center work owns
   `internal/download/service_notification_rows.go`, which references `animeRunOutcome` 11 times
   and neither `hosterOutcome` nor `enqueueWithFallback` even once. The two changes stay disjoint
   exactly as long as that struct is not widened.
4. **Size.** `internal/download/service.go` is 541 raw lines, the largest file in the package.
   Widening the struct drags this change into that file for no benefit.

Per-attempt forensic data MUST be assembled locally at the emit site and discarded there. **When
an emit site appears to need a forensic field on the outcome, the correct response is to MOVE THE
EMIT SITE — never to widen the struct.** The apparent need is the signal that the record is being
written in the wrong place.

#### Scenario: Neither owning file is modified

- GIVEN the complete change with both slices applied
- WHEN the diff is inspected
- THEN `internal/download/service.go` MUST show a zero-line diff
- AND `internal/download/service_notification_rows.go` MUST show a zero-line diff

#### Scenario: No forensic field reaches the live progress channel

- GIVEN the per-attempt forensic fields introduced by this change
- WHEN they are recorded
- THEN none MUST be stored on the anime run-outcome structure or on its progress-delta alias
- AND none MUST reach the live progress fan-out or any event-bus payload

#### Scenario: Forensic fields are assembled and discarded at the emit site

- GIVEN a hoster attempt whose terminal exit, credited hoster and attempt index are recorded
- WHEN the episode-level entry has been persisted
- THEN those values MUST NOT survive beyond the emit site's local scope
- AND the anime run outcome MUST hold exactly the fields it held before this change

---

### Requirement: Forensic Records Survive the Persistence Pipeline

Recording a forensic field is worthless if the record is dropped, truncated or unreachable. Every
entry this change adds or enriches MUST satisfy all four of the following:

| Constraint | Why |
|---|---|
| Reach the durable structured log, not the event bus alone | Bus publishes are never persisted; a field added only there reaches the UI and leaves the forensic record unchanged. |
| Be emitted at `info` or `warn`, never `debug` | Debug entries are dropped from persistence by default. |
| Keep its serialized metadata under the persistence bound | The bound is ALL-OR-NOTHING: an over-bound object is replaced ENTIRELY by a truncation marker, so one oversized status snapshot destroys the probe array sitting beside it in the same record. |
| Put every discriminator a reader must QUERY on into the event type or the message text | The persisted metadata has no filter dimension; text search reaches only message, domain and event type. |

Unbounded collections (the status snapshot's link and package arrays) MUST NOT be serialized
element-by-element into metadata. They MUST contribute aggregate counts, with totals recorded
separately, so record size cannot scale with a pathological status response.

#### Scenario: New entries are durably persisted, never debug-only

- GIVEN each entry type this change adds
- WHEN it is emitted
- THEN its level MUST be `info` or `warn`
- AND it MUST be persisted to the durable event store

#### Scenario: An oversized status snapshot cannot destroy the record beside it

- GIVEN a status response carrying a pathologically large number of links and packages
- WHEN the removal entry is persisted
- THEN the serialized metadata MUST stay under the persistence bound
- AND the persisted record MUST NOT be replaced by a truncation marker

#### Scenario: Query discriminators are reachable through the reader's filter surface

- GIVEN a reader searching for every removal that fired at one specific removal site
- WHEN they query the persisted event store
- THEN the discriminator MUST be reachable through the event type or the message text
- AND MUST NOT exist only inside the unfilterable metadata object

---

### Requirement: The Post-Grace Disk Re-Check Records Its Own Evidence

The post-grace disk re-check returns before the JD evaluation runs, and the JD evaluation is what
persists the probe timeline on the failed-detect path. The re-check MUST therefore persist that
timeline itself. Losing it would blind the probe instrument on precisely the case it was built to
observe — a transfer that started and finished inside a blind gap between probes — which is the
evidence the deferred probe-schedule work depends on.

The carrier MUST be the SAME `download.detect_start_failed` event type the JD evaluation uses, at
the same level and with the same metadata shape. That entry records the DETECT PHASE's outcome, not
the attempt's: the detect phase genuinely gave up with every probe reporting `found:false`, and
that entry ALREADY appears today on attempts that go on to succeed through the completion poll. So
reuse introduces no new ambiguity, and it satisfies "Download-Start Probe Timeline Is Persisted"
verbatim, including its exactly-one-entry-per-attempt rule — the JD evaluation cannot also fire on
this path.

The attempt's terminal outcome is recorded separately, by the per-attempt ledger and the
episode-level entry. A reader determines the attempt's outcome from those, never from the detect
phase's record.

#### Scenario: A disk-confirmed attempt still persists its probe timeline

- GIVEN a hoster attempt whose detect phase observed no transfer evidence
- AND whose post-grace disk re-check confirms the episode landed
- WHEN the attempt terminates in success
- THEN the system MUST persist exactly ONE `download.detect_start_failed` entry carrying the
  ordered probe array
- AND every recorded probe's `found` MUST be `false`
- AND the system MUST NOT persist zero probe-timeline entries for that attempt

#### Scenario: The probe carrier keeps the shape it has on the failed-detect path

- GIVEN the probe-timeline entry persisted for a disk-confirmed attempt
- WHEN it is compared against the entry persisted when the JD evaluation runs
- THEN its event type, level and metadata shape MUST be identical
- AND the per-attempt ledger entry for that attempt MUST record a success `outcome`

#### Scenario: Probe offsets advance under a moving clock

- GIVEN a disk-confirmed attempt whose probes are separated in time
- WHEN the probe timeline is persisted
- THEN the recorded `elapsedMs` values MUST be strictly increasing
- AND MUST be relative to that attempt's start, not identical to one another

#### Scenario: The re-check widens no structure

- GIVEN the post-grace disk re-check and every field it records
- WHEN the diff is inspected
- THEN no field MUST be added to the anime run-outcome structure or to its progress-delta alias
- AND no field MUST be added to any event-bus payload
