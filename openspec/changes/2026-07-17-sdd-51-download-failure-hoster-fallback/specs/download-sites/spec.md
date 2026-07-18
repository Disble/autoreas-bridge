# Delta for Download Sites

## ADDED Requirements

### Requirement: JD Status Classification by Destination Folder

The system MUST be able to classify the live JD status of an enqueued hoster attempt by querying JD packages/links whose `SaveTo`/`Destination` equals the anime's `Carpeta` (the only stable correlation key, since `AddAndStart` sets no package name and discards the crawl job id). The classification MUST resolve to exactly one of three states:

- `downloading` — online at crawl stage and/or running/progressing at download stage.
- `finished-ok` — the download-stage link reports finished. (This state exists for completeness of the classifier; it MUST NOT be used to declare run success — the filesystem remains the success source of truth, see the `download-orchestration` capability.)
- `dead` — `CrawledLink.Availability == "OFFLINE"` at crawl stage, OR the download-stage boolean triad is all false (`not Finished && not Running && not Skipped`) together with an error-type `StatusIconKey`.

The classifier MUST use only these structured signals (`Availability`, the `Finished`/`Running`/`Skipped` booleans, `StatusIconKey`). The classifier MUST NOT string-match the free-form, locale-dependent `Status` field (e.g. matching on `"File not found"`) to determine `dead`.

#### Scenario: Crawl-stage OFFLINE classifies as dead

- **GIVEN** a JD `CrawledLink` for the destination folder reports `Availability == "OFFLINE"`
- **WHEN** the classifier evaluates the destination folder's status
- **THEN** the classifier MUST return `dead`

#### Scenario: Download-stage error signal classifies as dead

- **GIVEN** a JD `DownloadLink` for the destination folder reports `Finished=false`, `Running=false`, `Skipped=false`, and an error-type `StatusIconKey`
- **WHEN** the classifier evaluates the destination folder's status
- **THEN** the classifier MUST return `dead`

#### Scenario: Online-but-incomplete classifies as downloading

- **GIVEN** a JD `CrawledLink` reports `Availability == "ONLINE"` and no download-stage link yet exists, OR a `DownloadLink` reports `Running=true`
- **WHEN** the classifier evaluates the destination folder's status
- **THEN** the classifier MUST return `downloading`, NOT `dead`

#### Scenario: Free-form Status text alone MUST NOT trigger dead

- **GIVEN** a JD `DownloadLink` whose `Status` string contains `"File not found"` but whose `StatusIconKey` is not an error type and the boolean triad is not all-false
- **WHEN** the classifier evaluates the destination folder's status
- **THEN** the classifier MUST NOT return `dead` based on the `Status` string alone

#### Scenario: No matching package yet defaults to downloading, not dead

- **GIVEN** no JD package or link with `SaveTo`/`Destination` equal to the anime's `Carpeta` exists yet (JD has not registered the crawl result)
- **WHEN** the classifier evaluates the destination folder's status
- **THEN** the classifier MUST return `downloading` (treated as "not yet observed", never a false `dead`)

## MODIFIED Requirements

### Requirement: Failure-Cause Classification Is Telemetered

The system MUST classify a download failure into a distinguishable cause — at minimum `captcha`, `hoster_down`, or `slow_or_timeout` — and record it in both `download_runs.error_summary` and the structured log `Metadata.failureKind`, so unattended runs yield actionable signal. No programmatic captcha-solving is in scope; this is telemetry only. A hoster that JD classifies as `dead` (see "JD Status Classification by Destination Folder") and that exhausts every configured hoster in the fallback list MUST be recorded as `hoster_down`, not `slow_or_timeout`, even though the failure was detected before the filesystem completion timeout elapsed.

(Previously: `hoster_down` was only reachable via an enqueue-API error; a JD-reported dead status after a successful enqueue was invisible to the classifier and fell through to `slow_or_timeout` only after the full filesystem poll timeout.)

#### Scenario: Captcha-blocked download is classified as captcha

- **GIVEN** an enqueue that succeeds but the hoster/JD reports a captcha or blocked state with no download progress
- **WHEN** the run records the failure
- **THEN** the system MUST set the failure cause to `captcha` in `error_summary` and `Metadata.failureKind`

#### Scenario: Unreachable hoster is classified as hoster_down

- **GIVEN** an enqueue error or an unreachable hoster link that triggers the try-next-hoster fallback
- **WHEN** the run records the failure
- **THEN** the system MUST set the failure cause to `hoster_down` in `error_summary` and `Metadata.failureKind`

#### Scenario: JD-reported dead hoster on every fallback entry is classified as hoster_down

- **GIVEN** every hoster in the ordered fallback list is classified `dead` by JD status before the filesystem completion timeout elapses
- **WHEN** the run records the failure for that episode
- **THEN** the system MUST set the failure cause to `hoster_down` in `error_summary` and `Metadata.failureKind`
- **AND** the system MUST NOT set the failure cause to `slow_or_timeout` for this episode

#### Scenario: Started-but-unfinished download is classified as slow_or_timeout

- **GIVEN** an enqueued download that JD classifies as `downloading` (genuinely alive) but that does not reach the expected file count within the poll timeout
- **WHEN** the timeout elapses
- **THEN** the system MUST set the failure cause to `slow_or_timeout` in `error_summary` and `Metadata.failureKind`
