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
