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

The AJAX endpoint is PAGINATED (16 entries per page), so the adapter MUST walk every page before deciding which episode is the latest. Reading only the first page reports the 16th episode as the latest for any longer-running anime, which "Online Episode Availability" then reads as up-to-date. `total` counts every episode across all pages and MUST NOT be read as this page's entry count.

#### Scenario: Episodes are returned
- GIVEN a valid AJAX response with `total > 0` and matching `data` entries
- WHEN the adapter parses the response
- THEN the adapter MUST return the parsed episode list

#### Scenario: The latest episode lives on a later page
- GIVEN an anime whose AJAX listing spans more than one page (e.g. episodes 1-16 on page 1 and episode 17 on page 2)
- WHEN the adapter lists episodes
- THEN the adapter MUST report the highest episode number across ALL pages, never the first page's highest

#### Scenario: A page fails mid-walk
- GIVEN an AJAX listing whose first page succeeds and whose later page fails
- WHEN the adapter lists episodes
- THEN the adapter MUST fail loudly rather than return the pages it already collected, because a truncated listing under-reports the latest episode and silently produces a false up-to-date verdict

#### Scenario: Pagination terminates
- GIVEN an AJAX listing that reports more pages than it can serve, or an exhausted page returning an empty `data` array
- WHEN the adapter walks the pages
- THEN the walk MUST stop on the exhausted page and MUST remain bounded by a maximum page count

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
