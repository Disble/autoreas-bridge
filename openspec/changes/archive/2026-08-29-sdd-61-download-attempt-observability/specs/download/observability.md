# Delta for download/observability

Change: `2026-08-29-sdd-61-download-attempt-observability`.

> **Deliberate override of the 650-word spec budget.** Eight requirements are mandated by the
> proposal's Capabilities section, and one of them pins a closed enum whose whole purpose is that
> every member is distinguishable — an enumeration that cannot be compressed without destroying
> the requirement. Field tables replace narrative wherever possible.

**Acceptance criterion applied to every field below:** *a good metric is one that helps you make a
specific decision.* Each requirement names the decision its fields enable. A field with no
decision behind it was cut.

**Delivery.** Requirements are tagged `[Slice 1]` (items 1, 1b, 2, 4) or `[Slice 2]` (item 3).
Both slices land on one branch as two sequential commits. Untagged requirements apply to both.

---

## ADDED Requirements

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

**Decision enabled by `exit`:** was the success OBSERVED by the credited attempt, or merely found
already on disk when that attempt began? This is the central question the change exists to answer,
and no other recorded field answers it. `exit` also settles "was the file renamed": the
entry-guard success skips completion handling entirely and performs no rename, while the
filesystem-poll success renames — and the rename is what the next episode's baseline count reads.

**Decision enabled by `baseline` and `observed`:** is the classifier declaring finished downloads
dead, and how often? A `dead`-producing `exit` recorded beside an `observed` count that had
already advanced past `baseline` is that defect, visible after the fact, without the system ever
branching on it. This is what sizes the follow-up fix.

`exit` MUST be a CLOSED enum with ONE DISTINCT VALUE per terminal point below. Indicative names
are illustrative; design owns final naming. The DISTINCTIONS are mandatory.

| # | Terminal point | Kind | Indicative value |
|---|---|---|---|
| 1 | Watch entry, episode counter dependency absent | timeout | `counter_unavailable` |
| 2 | Watch entry guard, disk already ahead of baseline (no rename) | success | `disk_ahead_at_entry` |
| 3 | Pre-check classified the hoster dead | dead | `precheck_dead` |
| 4 | Completion poll observed the count advance (rename performed) | success | `fs_poll_confirmed` |
| 5 | Completion poll reached its deadline | timeout | `fs_poll_deadline` |
| 6 | Completion poll interrupted by cancellation | timeout | `cancelled_during_poll` |
| 7 | Post-grace, downloader client absent, first hoster | dead | `grace_client_absent_first` |
| 8 | Post-grace, downloader client absent, fallback hoster | timeout | `grace_client_absent_fallback` |
| 9 | Post-grace status query error, first hoster | dead | `grace_query_error_first` |
| 10 | Post-grace status query error, fallback hoster | timeout | `grace_query_error_fallback` |
| 11 | Post-grace status classified dead | dead | `grace_classified_dead` |
| 12 | Post-grace, no positive signal, first hoster | dead | `grace_no_signal_first` |
| 13 | Post-grace, no positive signal, fallback hoster | timeout | `grace_no_signal_fallback` |
| 14 | Pipeline: downloader unavailable, no attempt made | — | `jd_unavailable` |
| 15 | Pipeline: cancelled before an attempt started | — | `cancelled_before_attempt` |
| 16 | Pipeline: enqueue error on the last attempted hoster | — | `enqueue_error` |
| 17 | Pipeline: no hosters resolved, no attempt ever ran | — | `no_hosters` |

Three constraints on that enum, each of which a naive implementation violates:

1. **Values 8, 10 and 13 MUST NOT collapse into values 7, 9 and 11.** They are separate returns
   reached under a different hoster position and produce a different kind. Folding the fallback
   mirrors into an undifferentiated `timeout` destroys exactly the discriminator this requirement
   exists to provide.
2. **Values 5 and 6 MUST NOT share one value.** They are produced by one composite condition
   today, but a user pressing Stop and a genuine poll-deadline expiry are different decisions.
3. **The post-grace proceed-and-continue path MUST NOT be stamped with any `exit`.** That path
   returns a sentinel outcome whose value is never surfaced; stamping it would make the field lie.
   The attempt continues, and its eventual terminal point supplies the recorded `exit`.

When the hoster loop exhausts every hoster, the recorded `exit` MUST be the LAST attempt's
terminal value, not a synthetic "exhausted" value — the reader's question is *how* the last
attempt ended.

#### Scenario: Observed success is distinguishable from success found already on disk

- GIVEN an attempt whose success came from the entry guard because the disk count was already
  ahead of the baseline
- WHEN the episode success is recorded
- THEN `exit` MUST differ from the value recorded when the completion poll confirmed the advance
- AND the two cases MUST be distinguishable from `exit` alone, without reading any other field

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

`observed` is one call away from being the fix to the very classifier defect it exists to measure.
The system MUST record it and MUST NEVER act on it. No branch, guard, loop condition, early
return, verdict, failure classification, run counter or event payload may read it.

This is the load-bearing boundary of the whole change. Recording the evidence WITHOUT the fix is
what makes the eventual fix verifiable against a measured baseline; wiring it into control flow
silently converts an instrumentation change into an unreviewed behavior change with no baseline
to compare against.

#### Scenario: No control flow reads the observed count

- GIVEN two otherwise identical attempts that differ ONLY in the on-disk count observed at the
  terminal point
- WHEN each attempt terminates
- THEN both MUST produce the same verdict, the same failure classification and the same run
  counters
- AND ONLY the recorded `observed` value MUST differ between the two persisted entries

#### Scenario: A dead verdict over an advanced disk count is recorded, not corrected

- GIVEN a hoster classified dead while the on-disk count has already advanced past the baseline
- WHEN the outcome is recorded
- THEN the entry MUST record `baseline`, `observed` and the `dead`-producing `exit`
- AND the verdict MUST remain dead, and the package removal MUST still occur

---

### Requirement: Forensic Instrumentation Changes No Behavior

The change is instrumentation only. No hoster verdict, no success or failure decision, no run
counter, no persisted run row and no event-bus payload may change value as a result of it.

The structural half of this rule — that the anime run-outcome structure MUST NOT gain fields — is
strong enough to stand on its own and is stated separately below.

#### Scenario: Verdicts, counters and run rows are unchanged

- GIVEN any download run replayed before and after this change
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
