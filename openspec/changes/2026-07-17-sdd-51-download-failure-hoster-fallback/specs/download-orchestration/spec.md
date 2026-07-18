# Delta for Download Orchestration

## MODIFIED Requirements

### Requirement: Hoster-Ordered Enqueue

The system MUST attempt to enqueue a download using the highest-priority available hoster link first, falling through to the next configured hoster when the higher-priority hoster link's enqueue-API call fails, OR when the JD status query (destination folder keyed on `SaveTo == anime.Carpeta`) classifies the current hoster's attempt as `dead` (see the `download-sites` capability's "JD Status Classification by Destination Folder"). The `dead` check MUST be polled from inside the fallback loop, on the existing 5s poll cadence, so a dead hoster is abandoned within one poll interval rather than waiting for the filesystem completion timeout. A hoster classified `downloading` MUST NOT trigger fallback and MUST be allowed to run up to the existing filesystem completion timeout (`FilesystemCompletionPollTimeout`).

(Previously: fallback only advanced on an enqueue-API error from `AddAndStart`; a JD-reported dead status after a successful enqueue was never observed by the fallback loop, so a dead link on the first hoster silently blocked the rest of the ordered list until the 30-minute filesystem poll timed out.)

#### Scenario: Top-priority hoster has a link

- **GIVEN** hoster priority `[Mediafire, Mega]` and links available for both
- **WHEN** the system enqueues the episode
- **THEN** the system MUST enqueue the Mediafire link first and MUST NOT attempt Mega unless Mediafire's enqueue fails or is later classified dead

#### Scenario: Top-priority hoster has no link

- **GIVEN** hoster priority `[Mediafire, Mega]` and only a Mega link is present
- **WHEN** the system enqueues the episode
- **THEN** the system MUST fall through to the Mega link

#### Scenario: Enqueue-API error still triggers fallback

- **GIVEN** `AddAndStart` returns an error for the current hoster
- **WHEN** the fallback loop observes the error
- **THEN** the system MUST advance to the next hoster in the ordered list, unchanged from prior behavior

#### Scenario: JD-reported dead status advances the fallback immediately

- **GIVEN** `AddAndStart` returns `nil` (JD's LinkGrabber accepted the links) for the current hoster, and a subsequent JD status poll classifies the destination folder as `dead`
- **WHEN** the fallback loop observes the `dead` classification
- **THEN** the system MUST abandon the current hoster and advance to the next hoster in the ordered list
- **AND** the system MUST NOT wait for `FilesystemCompletionPollTimeout` to elapse before advancing

#### Scenario: Slow-but-alive hoster keeps its full completion budget

- **GIVEN** `AddAndStart` returns `nil` and the JD status poll classifies the destination folder as `downloading`
- **WHEN** the episode has not yet appeared on disk
- **THEN** the system MUST NOT advance to the next hoster while `downloading` persists within `FilesystemCompletionPollTimeout`

#### Scenario: Every hoster reports dead

- **GIVEN** every hoster in the ordered fallback list is classified `dead` in turn
- **WHEN** the fallback loop exhausts the list
- **THEN** the system MUST report enqueue failure for the episode with failure kind `hoster_down` (see `download-sites` "Failure-Cause Classification Is Telemetered")

## ADDED Requirements

### Requirement: Dead Package Removed From JD Before Advancing

When a hoster attempt is classified `dead`, the system MUST call the JD client's `Remove()` on the offline package/link (keyed by the same `SaveTo`/`Destination` correlation) before advancing the fallback loop to the next hoster. This prevents a stale `OFFLINE` entry from contaminating the `SaveTo` correlation on a later run against the same destination folder. A `Remove()` failure MUST NOT abort the fallback loop or the run — it MUST be logged (warn level) and the fallback loop MUST still advance to the next hoster.

#### Scenario: Dead package is removed before the next hoster is tried

- **GIVEN** the current hoster's destination folder is classified `dead`
- **WHEN** the fallback loop advances
- **THEN** the system MUST call `Remove()` for the dead package/link before enqueueing the next hoster

#### Scenario: Remove failure does not crash the run

- **GIVEN** `Remove()` returns an error for the dead package
- **WHEN** the fallback loop handles the error
- **THEN** the system MUST log the failure and continue advancing to the next hoster
- **AND** the run MUST NOT abort or panic as a result

### Requirement: Filesystem Is Success Truth, JD Status Is Failure Truth

The system MUST NOT use a `finished-ok` JD status classification to declare an episode successfully downloaded — a new/renamed video file appearing on disk (per "Filesystem Is the Source of Truth for Download State") remains the sole success signal. The JD status classifier MUST be consulted only to detect failure (`dead`) earlier than the filesystem would reveal it.

#### Scenario: JD reports finished-ok but the file has not landed on disk

- **GIVEN** the JD status classifier reports `finished-ok` for the destination folder
- **AND** the expected video file has not yet appeared on disk (e.g. JD is still moving/renaming, or a Windows file-lock delays the move)
- **WHEN** the orchestrator evaluates completion for that episode
- **THEN** the system MUST NOT mark the episode as downloaded based on the JD status alone
- **AND** the system MUST continue relying on the filesystem poll (`pollCompletion`) to confirm success

### Requirement: Fallback and Failure Transitions Surface in Real Time

The system MUST publish a hoster-fallback transition or a JD-detected dead failure through the existing `events.Bus` (`EventNameDownloadRunProgress`) as soon as the JD status poll classifies a hoster as `dead`, not only when the run finalizes. A run MUST leave the `running` state promptly once every configured hoster for an episode is classified `dead`, instead of remaining `running` until the 30-minute filesystem timeout elapses.

#### Scenario: Frontend sees the fallback transition live

- **GIVEN** the current hoster is classified `dead` and the fallback loop advances to the next hoster
- **WHEN** the transition occurs
- **THEN** the system MUST publish an event on the existing `events.Bus` reflecting the hoster switch, observable by the Run-history panel without waiting for run completion

#### Scenario: Run does not linger in running after every hoster is dead

- **GIVEN** every hoster for an episode is classified `dead` well before `FilesystemCompletionPollTimeout` would have elapsed
- **WHEN** the fallback loop exhausts the ordered hoster list
- **THEN** the run's per-episode failure MUST be recorded immediately (not after the 30-minute filesystem timeout)
- **AND** the overall run MUST leave `running` once all outstanding anime workers complete, without being held up by the dead episode's filesystem poll
