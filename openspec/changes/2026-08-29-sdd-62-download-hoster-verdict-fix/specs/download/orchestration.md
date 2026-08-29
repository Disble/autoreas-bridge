# Delta for Download Orchestration

## ADDED Requirements

### Requirement: Filesystem Is Success Truth, JD Status Is Failure Truth

*Originally specified by SDD-51 (`2026-07-17-sdd-51-download-failure-hoster-fallback`) and never
merged into the deployed spec. This change ADDS the requirement carrying SDD-51's original scenario
plus the converse case SDD-51 did not cover.*

The system MUST NOT use a `finished-ok` JD status classification to declare an episode successfully
downloaded — a new/renamed video file appearing on disk (per "Filesystem Is the Source of Truth for
Download State") remains the sole success signal. The JD status classifier MUST be consulted only
to detect failure (`dead`) earlier than the filesystem would reveal it.

The CONVERSE MUST hold with equal force. Because JD status is failure truth only, the ABSENCE of a
positive JD signal MUST NOT by itself produce a dead verdict. The system MUST take a fresh
filesystem reading BEFORE producing any dead verdict for a hoster attempt, and MUST terminate that
attempt in success when the reading shows the episode landed. A JD status that reports nothing good
about a download that is already on disk describes JD's knowledge, not the episode's state.

That fresh reading MUST complete BEFORE any package removal for the attempt. The removal is
destructive and irreversible, and it destroys the downloader-side state that completion handling
needs to give the landed file a parseable name.

#### Scenario: JD reports finished-ok but the file has not landed on disk

- GIVEN the JD status classifier reports `finished-ok` for the destination folder
- AND the expected video file has not yet appeared on disk
- WHEN the orchestrator evaluates completion for that episode
- THEN the system MUST NOT mark the episode as downloaded based on the JD status alone
- AND the system MUST continue relying on the filesystem poll to confirm success

#### Scenario: No positive JD signal over a file that HAS landed, on the first hoster

- GIVEN a first-hoster attempt whose grace window observed no transfer evidence
- AND whose JD status carries no positive signal
- AND the episode file has already landed under the destination folder
- WHEN the attempt's outcome is determined
- THEN the system MUST terminate the attempt in success
- AND MUST NOT remove the downloader package for that attempt
- AND MUST NOT start a fallback hoster attempt for that episode

#### Scenario: The same state on a fallback hoster resolves to success, not timeout

- GIVEN a fallback-hoster attempt in that same state, which produces a timeout and no package
  removal rather than a dead verdict
- WHEN the attempt's outcome is determined
- THEN the system MUST terminate the attempt in success
- AND MUST NOT record it as a timeout

#### Scenario: The fresh reading precedes the package removal

- GIVEN a first-hoster attempt whose post-grace evaluation would remove the downloader package
- WHEN the attempt's outcome is determined
- THEN the fresh filesystem reading MUST be taken BEFORE the removal is performed
- AND when that reading shows the episode landed, no removal MUST occur

### Requirement: The Post-Grace Success Comparison Uses One Counting Basis

Both sides of the comparison that decides a post-grace disk-confirmed success MUST be taken on the
SAME counting basis, and the baseline MUST be captured on that basis. Comparing a count taken over
one scope against a baseline captured over a narrower scope is a violation of this requirement,
whichever scope is chosen.

Reading too HIGH is silent and permanent. A false success advances the catch-up cursor past an
episode that was never downloaded, and no later run re-triggers it — a strictly worse failure than
missing a real success, which the next run retries.

The chosen basis MUST also be wide enough to observe a file the downloader left inside a package
subfolder. That is the case this re-check exists to catch, so a basis that only sees the
destination root does not satisfy this requirement.

#### Scenario: Pre-existing subfolder residue does not produce a success

- GIVEN a destination folder whose package subfolder already held a video file before the attempt
  began, left by an earlier failed attempt
- AND nothing new landed during the attempt
- WHEN the post-grace disk re-check runs
- THEN it MUST NOT produce a success verdict
- AND the attempt MUST continue to its existing post-grace evaluation unchanged

#### Scenario: A file that landed inside a package subfolder produces a success

- GIVEN a destination folder whose baseline was captured with the episode absent everywhere beneath
  it
- AND the downloader wrote the episode into a package subfolder during the attempt
- WHEN the post-grace disk re-check runs
- THEN it MUST produce a success verdict

### Requirement: Every Success Path Completes the Episode

Every terminal point that reports an episode as successfully downloaded MUST run completion
handling — the rename BEFORE the flatten — so the file ends at the destination root under a name
the episode counter can parse. The ordering is load-bearing: the rename is delegated to the
downloader, which can only rename a file whose path it still knows, so flattening first leaves it
pointing at a path the system has already emptied.

A success path that only flattens leaves the file under the downloader's raw name. The highest-
episode read then resolves to 0 for that file and the download cursor survives on the file count
alone, so a single duplicate video file makes the cursor skip a real episode permanently.

Completion handling MUST remain best-effort: a rename or flatten failure MUST NOT turn a successful
download into a failed one.

#### Scenario: The entry-guard success completes the episode

- GIVEN an attempt whose success came from the entry guard because the disk count was already ahead
  of the baseline
- WHEN the attempt terminates
- THEN the system MUST run completion handling for that episode
- AND the episode MUST end at the destination root under a name the episode counter can parse

#### Scenario: The post-grace disk-confirmed success completes the episode

- GIVEN an attempt whose success came from the post-grace disk re-check
- WHEN the attempt terminates
- THEN the system MUST run completion handling for that episode

#### Scenario: A completion-handling failure does not fail the episode

- GIVEN a success path whose rename or flatten fails
- WHEN the episode outcome is recorded
- THEN the episode MUST still be recorded as successfully downloaded
- AND the failure MUST be surfaced in the persisted structured log rather than swallowed
