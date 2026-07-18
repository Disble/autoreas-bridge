# Design: sdd-51-download-failure-hoster-fallback

## Technical Approach

Give the existing 5s poll eyes. Extend the `JDClient` port with ONE
destination-keyed status query that returns **neutral, structured signals**
(crawl online/offline counts + per-link download booleans). A **pure classifier**
in the orchestration `download` package turns those signals into a
`downloading | finished-ok | dead` verdict. The hoster-fallback loop is
restructured so the JD poll runs **inside** it: a `dead` verdict aborts the
current hoster in seconds and advances to the next; disk remains the SUCCESS
authority, JD becomes the FAILURE authority. No new infrastructure — reuse the
5s interval, the 30-min budget, and the existing `events.Bus`. All code English
(ADR-007); Spanish stays only at the `Carpeta` data value.

## Architecture Decisions

### Decision: Split port (signals) from orchestration (classification)

**Choice**: The adapter method `PackageStatusByDestination` gathers raw JD
signals into a neutral `DestinationStatus` struct. A pure `classifyJDStatus(DestinationStatus) verdict`
function lives in the `download` package.
**Alternatives considered**: (a) classify inside the adapter and return an enum;
(b) a free orchestration classifier that itself calls `jd.JdClient`.
**Rationale**: (a) makes the three-state rule untestable without a fake network
seam and couples policy to the library; (b) leaks JD types into orchestration.
The split keeps the classifier unit-testable with plain struct literals (no fake
JD at all), while the adapter is tested against the real faked `jd.JdClient`
seam (`myjd_test.go` pattern) — matching the AGENTS "fake the network, not our
own abstraction" rule.

### Decision: Correlate strictly by normalized `SaveTo == Carpeta`

**Choice**: Query `LinkGrabber.Packages()` and `Downloader.Packages()`
(both expose `SaveTo`), keep those whose `SaveTo` normalizes-equal to the
anime's `Carpeta`, collect their `Uuid`s, then read crawl `Availability` (via
package `OnlineCount`/`OfflineCount`) and `Downloader.Links()` filtered by the
matched `PackageUuid`s. Normalize with `filepath.Clean` → unify separators
(`\`→`/`) → trim trailing `/` → lowercase on Windows.
**Alternatives considered**: correlate by package UUID from `Add`'s response
(it is a crawl **job** id, not the package UUID) or by package name (deliberately
never set — PoC #13).
**Rationale**: `SaveTo` is the only stable key; each anime owns its folder. JD
echoes destinations back with backslashes/trailing separators, so normalization
is mandatory for a reliable match.

### Decision: `dead` = crawl OFFLINE-only OR download error triad

**Choice**: A package is `dead` when **all** matched crawl links are OFFLINE
(`OfflineCount > 0 && OnlineCount == 0`), OR a matched download link satisfies
`!Finished && !Running && !Skipped` **and** carries an error `StatusIconKey`.
Any ONLINE crawl link ⇒ `downloading`. Never string-match `Status`.
**Alternatives considered**: require download-stage confirmation in addition to
OFFLINE.
**Rationale**: OFFLINE is JD's authoritative crawl verdict and surfaces in
seconds **before** the link ever enters the downloader, so demanding download
confirmation would defeat "near-immediate" (a dead link never reaches the
download stage). The download-error branch additionally catches links that die
mid-download. The OFFLINE-only rule also self-heals a failed `Remove`: a fresh
ONLINE link on retry outvotes any stale OFFLINE package (`OnlineCount > 0`).

### Decision: Failure cadence reuses existing constants; no new timeout

**Choice**: One unified 5s watch loop bounded by the existing
`FilesystemCompletionPollTimeout` (30 min). `dead` returns as soon as JD reports
it (~one to two ticks); a `downloading` link that never lands keeps the full
30-min budget. No new config constant.
**Alternatives considered**: a separate short per-hoster JD deadline.
**Rationale**: `dead` is already near-immediate relative to the 30-min bug, and
"slow-but-alive" is exactly the case the 30-min budget exists for. Adding a
second timeout only creates a false-negative window for genuinely slow hosters.

### Decision: `Remove()` failure ⇒ log Warn + continue

**Choice**: On `dead`, call `Downloader.Remove` / `LinkGrabber.Remove` for the
matched package; on error, log at Warn (folder + hoster) and advance anyway.
**Rationale**: Remove is best-effort cleanup; blocking fallback on it would keep
the episode undownloaded for a cleanup concern. The OFFLINE-only rule already
neutralizes stale-package contamination on later runs.

### Decision: Loop restructure — poll moves inside `enqueueWithFallback`

**Choice**: `enqueueWithFallback` no longer returns success on `AddAndStart`.
Per hoster it `AddAndStart`s, then runs `awaitHosterOutcome` (the unified 5s
loop): disk baseline exceeded ⇒ `success` (disk = SUCCESS truth); JD `dead` ⇒
`Remove` + `continue` to next hoster (JD = FAILURE truth) + emit fallback event
on `events.Bus`; deadline/ctx ⇒ `timeout`. `pollCompletion`'s disk-success logic
(recursive-count + Flatten-on-appear + baseline) is absorbed into
`awaitHosterOutcome`, preserving its exact success semantics.
**Rationale**: Directly answers the proposal — dead falls back live, slow-alive
keeps its budget, and the SUCCESS/FAILURE authorities stay explicit in one loop.

## Data Flow

    processAnime
        └─ enqueueWithFallback(ordered)
             for each hoster:
               AddAndStart ─▶ awaitHosterOutcome (5s poll, 30-min deadline)
                                ├─ disk baseline↑ ........ SUCCESS (disk truth)
                                ├─ classifyJDStatus == dead  FAILURE (JD truth)
                                │     └─ Remove() + Bus.Publish(progress) ─▶ next hoster
                                └─ deadline/ctx .......... TIMEOUT (slow_or_timeout)
             ▲ signals via JDClient.PackageStatusByDestination(Carpeta)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/download/jdownloader/client.go` | Modify | Add `PackageStatusByDestination` to `JDClient`; add `DestinationStatus` + `LinkSignal` types; **remove** `PackagesFinished` (superseded, dead code). |
| `internal/download/jdownloader/status.go` | Create | Adapter impl: query crawl+download packages, filter by normalized `SaveTo`, aggregate counts + link signals; `normDest`/`sameDestination` helpers. Keeps `myjd.go` under budget. |
| `internal/download/jdownloader/myjd.go` | Modify | Delete `PackagesFinished` method. |
| `internal/download/jdownloader/status_test.go` | Create | Adapter tests vs faked `jd.JdClient` (SaveTo match, count aggregation, no-match). |
| `internal/download/service_hoster_watch.go` | Create | `classifyJDStatus` (pure verdict), `awaitHosterOutcome`, verdict type. Keeps `service_pipeline.go` lean. |
| `internal/download/service_hoster_watch_test.go` | Create | Verdict truth-table + `awaitHosterOutcome` (dead→advance, disk→success, timeout) + `normDest` table. |
| `internal/download/service_pipeline.go` | Modify | Rework `enqueueWithFallback` to poll inside; absorb `pollCompletion` disk-success into the watch; simplify `processAnime` post-block. |
| `internal/download/service_test_helpers_test.go` | Modify | Add `PackageStatusByDestination` to `svcFakeJDClient`/`fallbackAwareJDClient`; drop `PackagesFinished`. |

## Interfaces / Contracts

```go
// jdownloader package — neutral signals, no verdict, no library types leaked.
type LinkSignal struct {
    Finished, Running, Skipped bool
    StatusIconKey              string
}
type DestinationStatus struct {
    Matched                        bool // a crawl/download package matched destination
    CrawlOnlineCount, CrawlOfflineCount int
    Links                          []LinkSignal
}

type JDClient interface {
    // ...existing methods (PackagesFinished removed)...
    // PackageStatusByDestination returns aggregated JD signals for the package(s)
    // whose SaveTo matches destination (SaveTo == anime.Carpeta). Matched=false when
    // nothing has crawled/enqueued for that folder yet (treated as "downloading").
    PackageStatusByDestination(ctx context.Context, deviceName, destination string) (DestinationStatus, error)
}
```

```go
// download package — pure policy, unit-tested with struct literals.
type hosterVerdict int
const (verdictDownloading hosterVerdict = iota; verdictFinishedOK; verdictDead)
func classifyJDStatus(st jdownloader.DestinationStatus) hosterVerdict
```

## Testing Strategy

Strict TDD — tests first, then implementation.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (download) | `classifyJDStatus` truth table: OFFLINE-only→dead, error-triad+iconKey→dead, any ONLINE→downloading, all running→downloading, empty/unmatched→downloading | plain `DestinationStatus` literals, no fakes |
| Unit (download) | `normDest`/`sameDestination`: Windows `\`, trailing sep, `.`, case-insensitivity | table test |
| Unit (download) | `awaitHosterOutcome`: dead→Remove+advance+event, disk-baseline→success, deadline→timeout | fake `JDClient` port + fake Counter/Flattener/Clock |
| Adapter (jdownloader) | `PackageStatusByDestination`: SaveTo match, crawl count aggregation, download link signals, no-match→Matched=false | faked `jd.JdClient` (extend `fakeDownloader`/`fakeLinkGrabber`) |
| Behavior (download) | Fallback advances to 2nd hoster on `dead`; `EventNameDownloadRunProgress` emitted; run leaves `running` without the 30-min wait | existing service tests + `fallbackAwareJDClient` |

Real `animes.dat` fixture is not relevant here (the JD boundary is network, not
the parser); coverage stays at the faked-seam and orchestration layers.

## Migration / Rollout

No migration required. Behavioral change only; no schema, config-default, or wire
changes. `PackagesFinished` removal is internal (never called in production).

## Open Questions

- [ ] None blocking. Confirm the exact error `StatusIconKey` value(s) JD emits
      for a dead download against a live device during apply; the classifier
      treats any non-empty error-type key with the false-triad as `dead`, so an
      unexpected key is safe-by-default (falls to `downloading`, disk timeout
      still bounds it).
