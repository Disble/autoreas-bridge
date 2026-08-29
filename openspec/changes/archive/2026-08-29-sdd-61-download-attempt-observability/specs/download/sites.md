# Delta for download/sites

Change: `2026-08-29-sdd-61-download-attempt-observability`.

Only ONE requirement changes here, and it changes by ADDITION: the existing failure-taxonomy
mandate is preserved verbatim in intent, and a per-attempt ledger is placed alongside it. The full
requirement block — including its three unchanged scenarios — is reproduced below because the
archive step REPLACES the matching requirement in the main spec with this block.

`[Slice 1 — item 4]`

---

## MODIFIED Requirements

### Requirement: Failure-Cause Classification Is Telemetered

The system MUST classify a download failure into a distinguishable cause — at minimum `captcha`,
`hoster_down`, or `slow_or_timeout` — and record it in both `download_runs.error_summary` and the
structured log `Metadata.failureKind`, so unattended runs yield actionable signal. No programmatic
captcha-solving is in scope; this is telemetry only.

The failure taxonomy answers *why an attempt failed*. It cannot answer *what the sequence of
attempts was*, because it is emitted only on failure: a successful attempt produces no
`failureKind` and therefore no record at all, leaving the ledger blank exactly where the credited
attempt sits. The system MUST therefore ALSO record a per-attempt ledger entry
(`download.hoster_attempt`) for EVERY hoster attempt, SUCCESS INCLUDED, carrying the `hoster`, its
zero-based `attemptIndex` in the resolved priority order, and the attempt's `outcome`.

The two channels are distinct and MUST NOT be merged: the failure-taxonomy entries stay the
classification channel and MUST remain unchanged in event type, level and `failureKind`, while the
ledger is a uniform one-row-per-attempt record whose value comes from being complete. The ledger
MUST NOT be used to derive or override a failure classification.

(Previously: the requirement mandated the failure taxonomy only, so hoster attempts were
observable exclusively through their failures and a successful attempt left no per-attempt record.)

**Decision enabled by the ledger:** which hoster to demote in the priority list, whether the first
hoster fails systematically (the order is wrong) or the fallback is quietly doing all the work,
and — by comparison against the hoster credited on the episode-success entry — whether a fallback
was credited for a previous hoster's bytes.

#### Scenario: Captcha-blocked download is classified as captcha

- GIVEN an enqueue that succeeds but the hoster/JD reports a captcha or blocked state with no download progress
- WHEN the run records the failure
- THEN the system MUST set the failure cause to `captcha` in `error_summary` and `Metadata.failureKind`

#### Scenario: Unreachable hoster is classified as hoster_down

- GIVEN an enqueue error or an unreachable hoster link that triggers the try-next-hoster fallback
- WHEN the run records the failure
- THEN the system MUST set the failure cause to `hoster_down` in `error_summary` and `Metadata.failureKind`

#### Scenario: Started-but-unfinished download is classified as slow_or_timeout

- GIVEN an enqueued download that makes some progress but does not reach the expected file count within the poll timeout
- WHEN the timeout elapses
- THEN the system MUST set the failure cause to `slow_or_timeout` in `error_summary` and `Metadata.failureKind`

#### Scenario: A successful attempt is recorded even though it has no failure cause

- GIVEN a hoster attempt that succeeds, so no `failureKind` applies
- WHEN the attempt terminates
- THEN the system MUST still persist one `download.hoster_attempt` entry carrying `hoster`,
  `attemptIndex` and a success `outcome`

#### Scenario: The ledger covers a fallback chain end to end

- GIVEN an episode whose first hoster is classified dead and whose second hoster succeeds
- WHEN the episode finishes
- THEN the system MUST persist exactly two `download.hoster_attempt` entries, with `attemptIndex`
  `0` and `1` in that order
- AND the failure-taxonomy entry for the dead first hoster MUST still be emitted, unchanged

#### Scenario: The ledger never overrides the classification

- GIVEN a hoster attempt that fails
- WHEN both the failure-taxonomy entry and the ledger entry are recorded
- THEN the recorded `failureKind` MUST be identical to what it would have been without the ledger
- AND the ledger entry MUST NOT alter `download_runs.error_summary`
