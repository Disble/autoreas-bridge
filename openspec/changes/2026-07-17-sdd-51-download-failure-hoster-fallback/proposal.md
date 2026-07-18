# Proposal — sdd-51-download-failure-hoster-fallback

Make the bridge **notice when a download fails inside JDownloader**, so the
ordered hoster fallback actually falls back and the run stops lying about its
state. Today a dead link on the first hoster is invisible: the fallback list is
never consulted and the run sits in `running` for half an hour before being
misfiled as a timeout. This change wires the JD status the bridge already has
access to into the fallback loop and the run finalizer, in real time, with no
new infrastructure.

## The problem (from the field)

A user watched a Mediafire link return "File not found" and the bridge did
**nothing useful** with it:

1. The next hoster in the priority list (Mega, Vidhide, Mp4upload, Mixdrop) was
   **never tried** — the entire reason the ordered fallback exists was defeated.
2. The run stayed in **`running`** for up to 30 minutes and the failed episode
   was ultimately classified as `slow_or_timeout`, never as a hoster failure.

The failure is real and common (hosters take links down constantly), yet the
bridge treats "JD accepted the link" as "the episode will download." Accepting a
link is not downloading it.

## What exists today

The pieces are almost all present; they are just not connected to the failure
reality:

- **The fallback loop exists but reacts to the wrong signal.**
  `Service.enqueueWithFallback` (`internal/download/service_pipeline.go:305`)
  iterates the ordered hosters and returns success the instant
  `JD.AddAndStart` returns `nil`. `myJDAdapter.AddAndStart`
  (`internal/download/jdownloader/myjd.go:146`) returns `nil` the moment JD's
  LinkGrabber **accepts** the links — long before the actual download. So the
  loop only ever advances on an enqueue-**API** error, which is not how hosters
  fail in the real world (Bug A).
- **Completion is judged by disk only, on a 30-minute leash.**
  `Service.pollCompletion` (`service_pipeline.go:333`) waits for a new episode
  file to land on disk. On a failed download the file never lands, so it spins
  until `FilesystemCompletionPollTimeout = 30 * time.Minute`
  (`internal/download/config/defaults.go:42`) and then returns `false` →
  `FailureKindSlowOrTimeout`. `run.Status` is the provisional `running` from
  `OpenRun`, finalized only after `wg.Wait()` across all workers
  (`service.go:326`), so one dead episode pins the whole run in `running` for up
  to 30 minutes (Bug B).
- **The polling channel is already there.** The bridge already polls every
  `FilesystemCompletionPollInterval = 5s`, and already streams live progress
  through `Service.recordProgress` (`service_effects.go:30`) publishing
  `EventNameDownloadRunProgress` on the in-memory `events.Bus`, which the
  frontend Run-history panel subscribes to. A fallback transition can ride this
  **existing** channel.
- **The JD status is queryable but discarded.** The vendored client
  (`github.com/rkosegi/jdownloader-go v1.0.3`) is polling-only, and it does
  expose the failure signal — but `JDClient.PackagesFinished` (`myjd.go:166`),
  wired through the whole adapter chain, is **never called in production** and
  only reads a `Finished` bool, so it cannot tell "finished OK" from "finished
  with error."

## The gaps this change closes

1. **No failure detection.** The bridge has no way to ask "did this download
   actually die?" Two stable JD signals are available and unused: crawl-stage
   `CrawledLink.Availability == "OFFLINE"` (surfaces in **seconds**, before any
   download attempt) and download-stage failure via the `DownloadLink` boolean
   triad (`not Finished && not Running && not Skipped`) plus an error
   `StatusIconKey`. Neither is consulted today.
2. **No correlation between an enqueue and its JD package.** `AddAndStart`
   discards the crawl job id and deliberately sets no package name, so there is
   no UUID to key on. The one stable correlation is
   `SaveTo` / `Destination == anime.Carpeta` — each anime owns its folder, so
   filtering packages/links by destination is unambiguous. This correlation must
   be built for the status query to be usable.
3. **The fallback loop and the run finalizer never see failure.** Even with a
   status query, the loop returns before failure is observable and the finalizer
   waits on the filesystem. Both must be moved to react to a `dead` verdict in
   real time instead of on the 30-minute timeout.

## The approach

The spine is the existing 5s poll. We give it eyes and put it **inside** the
fallback loop.

### Classify JD status by destination folder

Extend the `JDClient` port with a **status query keyed by destination folder**
(`SaveTo == anime.Carpeta`) that classifies a package as one of three states:

- **downloading** — online at crawl and/or running/progressing at download.
- **finished-ok** — the file is done (disk stays the authority here; see below).
- **dead** — `OFFLINE` at crawl stage, or the download-stage error signal (the
  boolean triad plus an error `StatusIconKey`).

Classification uses the **structured** signals only. It must **not** string-match
`"File not found"` — `Status` is free-form and locale-dependent; the availability
enum, the boolean triad, and `StatusIconKey` are the stable inputs.

### React in real time, inside the fallback loop

Move the JD status poll **inside** `enqueueWithFallback` so a `dead`
classification aborts the current hoster **immediately** and advances to the next
one, instead of returning success on enqueue and then waiting out the filesystem
timeout. A genuinely slow-but-alive download (`downloading`) must still be
allowed to run up to the existing completion timeout — only a `dead` verdict
short-circuits.

### Clean up the dead package

On a `dead` hoster, **`Remove()`** the offline package from JD before advancing
(user-confirmed). This prevents a stale `OFFLINE` entry from contaminating the
`SaveTo` correlation on a later run against the same folder.

### Keep the two sources of truth split

- **Filesystem remains the SUCCESS source of truth.** The disk move/rename
  boundary already handles the JD-owns-the-file race; SDD-28's
  "download count is filesystem truth" invariant is untouched.
- **JD status becomes the FAILURE source of truth.** Only JD can tell us a link
  is dead before the file would ever appear.

### Surface the transition, leave `running` on time

Emit failure and fallback transitions through the **existing** `events.Bus`
(`EventNameDownloadRunProgress`) so the frontend reflects "trying next hoster"
live, and so the run leaves `running` when reality changes rather than 30 minutes
later.

## Non-goals

- **No new real-time infrastructure.** The JD API offers no websocket/push; we
  reuse the existing 5s poll and the existing event bus. No new channel.
- **No change to the disk-is-truth-for-success invariant.** SDD-28 stands; disk
  remains the authority for successful downloads. This change only adds a
  failure authority.
- **No hoster-priority UI changes.** The ordered hoster list and any UI over it
  are out of scope; this is purely about making the existing order react to
  failure.
- **No revival of `PackagesFinished` as-is.** The new status query supersedes the
  dead `Finished`-bool path; whether to delete or repurpose the old method is a
  design detail, not a goal.

## Open questions for design

- **Placement of the classification helper** (adapter vs. orchestration seam) and
  how it stays unit-testable against a faked `jd.JdClient`.
- **Poll cadence and per-hoster deadline for the failure path** — a `dead`
  verdict should be near-immediate, while a slow-but-alive download keeps its
  full completion budget.
- **Whether crawl-stage `OFFLINE` alone declares dead**, or the download-stage
  error signal is also required as confirmation.
- **Go effective-line budget** (warn at 400, hard-fail above 500): the status
  query, the classifier, and the loop rework should be split across files rather
  than bloating `service_pipeline.go`.
