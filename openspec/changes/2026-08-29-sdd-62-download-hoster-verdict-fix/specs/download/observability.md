# Delta for Download Observability

> Each MODIFIED block below carries the ENTIRE requirement including unchanged scenarios, per the
> openspec delta convention. "Episode Terminal Exit Is Recorded" is ~110 lines of which six change;
> the copy is mandatory, because a partial block loses the rest at archive time.

## MODIFIED Requirements

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

## ADDED Requirements

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
