# Download Sites Specification

## Purpose

Defines the site-scraper registry contract and the jkanime adapter's behavior, including loud failure surfacing when extraction yields nothing.

## Requirements

### Requirement: Site Adapter Registry Resolution

The system MUST resolve the scraper adapter for an anime's `pagina` via a registry of named, priority-ordered site providers. The system MUST NOT use hardcoded string-contains branching to select a site adapter.

#### Scenario: Registered site resolves to its adapter
- GIVEN a registry with jkanime registered and an anime whose `pagina` matches jkanime's site descriptor
- WHEN the orchestrator resolves a site adapter for that anime
- THEN the registry MUST return the jkanime adapter

#### Scenario: Unregistered site yields an explicit, observable error
- GIVEN an anime whose `pagina` does not match any registered site
- WHEN the orchestrator resolves a site adapter for that anime
- THEN the registry MUST return an explicit "no adapter for this site" error
- AND the system MUST record this as a surfaced skip reason, not a silent no-op

### Requirement: jkanime CSRF and Anime ID Extraction

The jkanime adapter MUST extract the anime ID and CSRF token required for the episode-listing AJAX call from the anime's info page.

#### Scenario: Anime page contains both tokens
- GIVEN a valid jkanime anime page response body
- WHEN the adapter parses it
- THEN the adapter MUST extract a non-empty anime ID and CSRF token

#### Scenario: Anime page is missing required tokens
- GIVEN a jkanime anime page response body missing the anime ID or CSRF token
- WHEN the adapter parses it
- THEN the adapter MUST return an explicit error
- AND MUST NOT proceed to request episode listings with an empty/garbage ID

### Requirement: jkanime Episode Listing via AJAX

The jkanime adapter MUST retrieve the episode list via the site's AJAX endpoint and MUST treat an empty/zero-total response as a distinguishable outcome from a successful empty list.

#### Scenario: Episodes are returned
- GIVEN a valid AJAX response with `total > 0` and matching `data` entries
- WHEN the adapter parses the response
- THEN the adapter MUST return the parsed episode list

#### Scenario: AJAX reports zero total
- GIVEN an AJAX response with `total == 0` and an empty `data` array
- WHEN the adapter parses the response
- THEN the adapter MUST treat this as "no episodes available" (not an error) but MUST log it as an observable event, distinguishable from extraction failure

### Requirement: Download Link Extraction Failure Surfacing

The jkanime adapter MUST extract download links from the episode page's inline server list. If extraction yields zero links where episodes are known to exist, the system MUST surface a loud, observable error rather than a silent empty success.

#### Scenario: Links are extracted successfully
- GIVEN an episode page with a well-formed inline server list
- WHEN the adapter extracts links
- THEN the adapter MUST return one or more hoster-tagged links

#### Scenario: Extraction yields zero links
- GIVEN an episode page whose inline server list cannot be parsed (e.g. template drift)
- WHEN the adapter extracts links and the result is empty
- THEN the system MUST emit a `download.failed` event and/or structured error log entry
- AND MUST record the run/anime status to reflect extraction failure, not silently report success with zero downloads

### Requirement: Failure-Cause Classification Is Telemetered

The system MUST classify a download failure into a distinguishable cause — at minimum `captcha`, `hoster_down`, or `slow_or_timeout` — and record it in both `download_runs.error_summary` and the structured log `Metadata.failureKind`, so unattended runs yield actionable signal. No programmatic captcha-solving is in scope; this is telemetry only.

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
