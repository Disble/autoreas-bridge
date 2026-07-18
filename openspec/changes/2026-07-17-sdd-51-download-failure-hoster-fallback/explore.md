# Explore — sdd-51-download-failure-hoster-fallback

## Problem (from the field)

A download that fails inside JDownloader (e.g. Mediafire returns "File not
found" / "An Error occurred!") is **invisible to the bridge**. Consequences:

1. The next hoster in the priority list (Mega, Vidhide, Mp4upload, Mixdrop) is
   **never tried** — the whole point of the ordered hoster fallback is defeated.
2. The run stays in **`running`** for up to 30 minutes and the failed episode is
   only ever classified as `slow_or_timeout`, never as a hoster failure.

## Root cause (two independent bugs that compound)

### Bug A — the hoster fallback only catches enqueue-API errors

`Service.enqueueWithFallback` (`internal/download/service_pipeline.go:305`)
iterates hosters but returns success the instant `AddAndStart` returns `nil`:

```go
err := s.deps.JD.AddAndStart(ctx, ...)
if err == nil {
    return true, ""   // treated as "download will happen"
}
```

`myJDAdapter.AddAndStart` (`internal/download/jdownloader/myjd.go:146`) returns
`nil` as soon as JD's **LinkGrabber accepts** the links
(`device.LinkGrabber().Add(...)`). Accepting a link is not downloading it. The
actual "File not found" happens **later**, asynchronously, inside JD. So the
fallback `for _, hl := range ordered` loop only ever advances on an enqueue-API
error — which is **not** the real-world failure mode.

### Bug B — completion is judged by the filesystem only, with a 30-min timeout

After a "successful" enqueue, `Service.pollCompletion`
(`service_pipeline.go:333`) waits for a new episode file to appear on disk. On a
failed download the file never lands, so the loop spins until
`FilesystemCompletionPollTimeout = 30 * time.Minute`
(`internal/download/config/defaults.go:42`), then returns `false` →
`FailureKindSlowOrTimeout`.

`run.Status` is the provisional `running` default from `OpenRun` and is only
finalized after `wg.Wait()` across all anime workers (`service.go:326`). A single
failed episode therefore pins the run in `running` for up to 30 minutes.

### Dead code that should have been the fix

`JDClient.PackagesFinished` is implemented through the **entire** adapter chain
(`myjd.go:166`, `app_download.go:104`) but is **never called in production** —
grep finds it only in tests. And even as written it only reads `pkg.Finished`
(bool), discarding `Status`/`Running`, so it cannot distinguish "finished OK"
from "finished with error".

## Validated JD API (github.com/rkosegi/jdownloader-go v1.0.3)

Read directly from the module cache. Findings:

- **Polling only.** No websocket/subscription anywhere in `JdClient`, `Device`,
  `Downloader`, or `LinkGrabber`. "Real time" on the JD side means
  **short-interval polling** — and the bridge already polls every
  `FilesystemCompletionPollInterval = 5s`.
- **Crawl-stage signal (fastest).** `LinkGrabber.Links()` →
  `CrawledLink.Availability` is `"ONLINE"` / `"OFFLINE"`
  (`linkgrabber.go:159`). A "File not found" surfaces as **`OFFLINE` in seconds**,
  before any download attempt.
- **Download-stage signal.** `Downloader.Links()` → `DownloadLink` exposes
  `Finished`, `Running`, `Skipped`, `BytesLoaded`, `Status`, `StatusIconKey`
  (`downloader.go:75`). Robust failure = not finished AND not running AND not
  skipped AND error-type `StatusIconKey`. **Do not** string-match `"File not
  found"` — `Status` is free-form and locale-dependent; `StatusIconKey` and the
  boolean triad are the stable signals.
- **Correlation gap (the real design cost).** `AddAndStart` discards the
  `*DataResponse` from `Add` (which is a link-collecting **job id**, not the
  download package UUID) and deliberately sets **no package name** (PoC #13
  quirk). The only stable correlation key between an enqueue and its JD package
  is **`SaveTo` / `Destination` == `anime.Carpeta`** (`DownloadPackage.SaveTo`,
  `downloader.go:112`). Each anime has its own folder, so filtering
  packages/links by `SaveTo` is unambiguous.
- **Cleanup.** `Downloader.Remove([]linkIds, []pkgIds)` (`downloader.go:125`)
  and `LinkGrabber.Remove(...)` are available to purge a dead package.

## Existing real-time channel to reuse

The bridge already streams live progress: `Service.recordProgress`
(`service_effects.go:30`) publishes `EventNameDownloadRunProgress` on the
in-memory `events.Bus`; the frontend Run-history panel subscribes and updates
live. A hoster-fallback transition and the failure can be surfaced through this
**existing** channel — no new real-time infrastructure is needed.

## Approach direction (validated, user-confirmed)

1. Extend the `JDClient` port with a **status query** keyed by destination
   folder (correlation via `SaveTo == anime.Carpeta`) that classifies a package
   as `downloading` / `finished-ok` / `dead` (OFFLINE at crawl, or error at
   download).
2. Move the JD status poll **inside** the hoster fallback loop so a `dead`
   classification aborts the current hoster **immediately** and advances to the
   next — instead of waiting out the 30-min filesystem timeout.
3. On a dead hoster, **`Remove()`** the offline package from JD (user-confirmed
   decision) so a stale OFFLINE entry cannot contaminate the `SaveTo`
   correlation on a later run.
4. Keep the filesystem completion as the **success** source of truth (the disk
   move/rename boundary already handles JD-owns-the-file races); JD status is the
   **failure** source of truth.
5. Emit failure/fallback transitions through the existing `events.Bus` so the
   run leaves `running` when reality changes, not 30 minutes later.

## Non-goals

- No new websocket/push layer (the API doesn't offer one).
- No change to the on-disk "download count is filesystem truth" invariant
  (SDD-28 decision — disk remains the authority for *success*).
- No hoster-priority UI changes.

## Open decisions for design

- Where the status-classification helper lives (adapter vs. orchestration seam)
  and how it stays unit-testable against a faked `jd.JdClient`.
- Poll cadence and per-hoster deadline for the *failure* path (a `dead` verdict
  should be near-immediate; a genuinely slow-but-alive download must still be
  allowed to run up to the existing completion timeout).
- Whether crawl-stage `OFFLINE` alone is enough to declare dead, or we also
  require the download-stage error signal as confirmation.
