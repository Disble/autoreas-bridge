# Download Orchestration Specification

## Purpose

Defines the per-run decision logic that turns "today's active animes" into downloads: the trigger semantic (filesystem as the source of truth), per-anime failure isolation, hoster-ordered enqueue, completion detection, and flattening.

## Requirements

### Requirement: Online-vs-Disk Trigger Semantic

The system MUST decide a download is needed for an anime when `online_latest_episode_number > count_of_video_files_on_disk`. Here "online" means the HIGHEST EPISODE NUMBER returned by the site adapter (not a count of listed entries), matching the validated PoC's `LatestEp` (`cmd/poc/scraper.go`). The on-disk count MUST be re-derived from the filesystem on every run; the system MUST NOT use `NroCapVisto` (viewing progress) and MUST NOT use any value cached in `bridge.db` as the trigger condition.

#### Scenario: More episodes online than on disk
- GIVEN an anime whose highest online episode number is 5 and 3 video files on disk
- WHEN the orchestrator evaluates the anime
- THEN the system MUST mark it as needing download (latest online number 5 exceeds disk count 3)

#### Scenario: Disk count already matches online count
- GIVEN an anime whose highest online episode number is 5 and 5 video files on disk
- WHEN the orchestrator evaluates the anime
- THEN the system MUST NOT trigger a download for that anime

#### Scenario: NroCapVisto is never consulted for the trigger
- GIVEN an anime with `NroCapVisto=2`, highest online episode number 5, and 5 video files already on disk
- WHEN the orchestrator evaluates the anime
- THEN the system MUST NOT trigger a download, because disk count already satisfies the online latest number regardless of `NroCapVisto`

#### Scenario: Online numbering gap is compared by highest number, not entry count
- GIVEN a site adapter that returns online episodes numbered `[1, 2, 4]` (a gap at 3) so the highest online number is 4, and 2 video files on disk
- WHEN the orchestrator evaluates the anime
- THEN the system MUST trigger a download because the highest online number (4) exceeds the disk count (2)
- AND the system MUST NOT treat the count of returned entries (3) as the comparison basis

### Requirement: Filesystem Is the Source of Truth for Download State

The count of video files on disk MUST be the only authority for what has already been downloaded. The system MUST NOT persist a "downloaded count" in `bridge.db` and consult it to decide whether to download, and MUST NOT consult `download_runs` history to make that decision. `download_runs` is historical telemetry only.

#### Scenario: Manually deleted episode is re-downloaded
- GIVEN an anime that was fully downloaded in a previous run (history shows it complete) but a user has since manually deleted one episode file from disk
- WHEN the orchestrator evaluates the anime in a later run
- THEN the system MUST re-derive the count from disk, observe that the latest online number now exceeds the on-disk count, and trigger a re-download
- AND the system MUST NOT skip it based on any cached count or prior run history

### Requirement: Per-Anime Fan-Out With Failure Isolation

The system MUST evaluate every eligible anime in a run independently, such that one anime's failure does not abort evaluation or downloading of other animes.

#### Scenario: One anime fails, others continue
- GIVEN a run with 3 eligible animes where anime B's scrape fails
- WHEN the run executes
- THEN anime A and anime C MUST still be evaluated and downloaded if eligible
- AND the run MUST record anime B's failure without marking the entire run as aborted

#### Scenario: Run-level status reflects partial failure
- GIVEN a run where at least one anime succeeded and at least one anime failed
- WHEN the run completes
- THEN the system MUST record the run `status` as `partial`, not `error`

### Requirement: Hoster-Ordered Enqueue

The system MUST attempt to enqueue a download using the highest-priority available hoster link first, falling through to the next configured hoster only if the higher-priority hoster link is unavailable or enqueue fails.

#### Scenario: Top-priority hoster has a link
- GIVEN hoster priority `[Mediafire, Mega]` and links available for both
- WHEN the system enqueues the episode
- THEN the system MUST enqueue the Mediafire link first and MUST NOT attempt Mega

#### Scenario: Top-priority hoster has no link
- GIVEN hoster priority `[Mediafire, Mega]` and only a Mega link is present
- WHEN the system enqueues the episode
- THEN the system MUST fall through to the Mega link

### Requirement: Completion Detection via Filesystem Polling

The system MUST detect download completion by polling the destination folder's video file count rather than relying solely on JDownloader's reported job status.

#### Scenario: Episode count matches after polling
- GIVEN an enqueued download and a destination folder
- WHEN the polled video file count in the destination folder reaches the expected count
- THEN the system MUST mark the episode as downloaded

#### Scenario: Polling times out
- GIVEN an enqueued download that never reaches the expected file count within the configured timeout
- WHEN the timeout elapses
- THEN the system MUST record the episode as failed/incomplete for this run
- AND MUST NOT block evaluation of subsequent animes

### Requirement: Flatten JD Subfolders

The system MUST flatten any subfolders JDownloader creates inside the destination folder so completed video files end up directly in the expected destination path.

#### Scenario: JD creates a package subfolder
- GIVEN JDownloader downloads an episode into a nested subfolder of the destination
- WHEN the system detects the completed file inside the subfolder
- THEN the system MUST move the file to the destination folder root
- AND MUST log (not silently swallow) any failure to move a file

### Requirement: No Write-Back to the Anime Context

The download context MUST NOT write any anime state. It MUST NOT call `AnimeWriteService.PatchAnime`, MUST NOT update `NroCapVisto`, and MUST NOT open `animes.dat`. It reads animes via `AnimeQueryService` and persists only its own `download_*` tables. Download presence is authoritatively reflected by the filesystem, not by any written-back field (see "Filesystem Is the Source of Truth for Download State").

#### Scenario: Successful download does not mutate anime state
- GIVEN an anime download is confirmed complete (filesystem count increased to the expected value)
- WHEN the orchestrator finishes processing that anime
- THEN the system MUST NOT call any anime write path (`PatchAnime`/`NroCapVisto`)
- AND the only persisted side effect MUST be in the `download_*` tables (run telemetry)

### Requirement: Explicit Tipo 1/2 Skip

The system MUST detect anime records with `Tipo` 1 (movie) or 2 (OVA) and explicitly skip them with a surfaced, observable reason. The system MUST NOT silently treat them as series or mis-trigger a download for them.

#### Scenario: Movie-type anime is present in today's active list
- GIVEN an anime with `Tipo=1`
- WHEN the orchestrator evaluates today's active animes
- THEN the system MUST skip this anime
- AND MUST record a skip reason (e.g. `"unsupported_tipo"`) visible in the run's structured log and/or `download_runs` row

#### Scenario: OVA-type anime is present
- GIVEN an anime with `Tipo=2`
- WHEN the orchestrator evaluates today's active animes
- THEN the system MUST skip this anime with the same surfaced-reason guarantee as Tipo 1

### Requirement: Missing Pagina/Carpeta Surfaced as Actionable State

The system MUST detect animes missing `pagina` or `carpeta` and surface this as an actionable, visible state, not a silent skip.

#### Scenario: Anime has no configured page
- GIVEN an eligible anime with `Pagina` absent or empty
- WHEN the orchestrator attempts to evaluate it
- THEN the system MUST record a skip reason identifying the missing page
- AND this state MUST be retrievable by the UI (run detail or anime gap indicator)

#### Scenario: Anime has no configured folder
- GIVEN an eligible anime with `Carpeta` absent or empty
- WHEN the orchestrator attempts to evaluate it
- THEN the system MUST record a skip reason identifying the missing folder
- AND MUST NOT attempt to enqueue or poll a destination that does not exist

### Requirement: User-Notable Moments Emit Through the Shared Notifier

The download context MUST surface user-notable moments (a run completed with downloads, a run failed, JD offline, an anime skipped for a missing page/folder) by emitting through the injected shared `Notifier` port (see the `notifications` capability). The download context MUST NOT contain its own OS-toast or desktop-notification code, and MUST NOT shell out to PowerShell or any other ad-hoc notification mechanism.

#### Scenario: Run completes with downloads
- GIVEN a run finishes having downloaded at least one episode
- WHEN the run reaches its terminal status
- THEN the system MUST emit a `Notification` through the injected `Notifier` (e.g. `Source="download"`, a success level) summarizing the result
- AND the system MUST NOT invoke any download-local toast/OS-notification code

#### Scenario: JD offline during a run
- GIVEN a run determines JD is offline
- WHEN the run records its `jd_offline` outcome
- THEN the system MUST emit a `Notification` through the injected `Notifier` indicating JD is unavailable (and that manual links are available)

#### Scenario: Notifier failure does not fail the run
- GIVEN the injected `Notifier` (or one of its adapters) returns an error
- WHEN the download context emits a user-notable moment
- THEN the run MUST still complete and finalize normally
- AND the notification failure MUST NOT propagate as a run failure

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
