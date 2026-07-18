# Tasks: SDD-51 Download Failure Hoster Fallback

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1300 (2 new files, 3 modified files, 2 test helper updates, 1 catchup-test fixture update) |
| 400-line budget risk | Medium — `service_pipeline.go` and `service_hoster_watch.go` are the files at risk; keep `awaitHosterOutcome`/`enqueueWithFallback` split tight and watch `go run ./tools/checkgofilesize` after every GREEN |
| Chained PRs recommended | No — single bounded slice, no schema/wire changes, no frontend surface |
| Suggested split | N/A (single PR) |
| Delivery strategy | ask-on-risk (confirmed no chaining needed; proceed as one PR) |
| Chain strategy | N/A |

Decision needed before apply: No — this is a single, atomic behavioral change confined to `internal/download` and `internal/download/jdownloader`; no PR split required.

---

## Phase 1: Port — Neutral JD Status Types

- [x] 1.1 RED: `internal/download/jdownloader/client.go` gains `DestinationStatus`/`LinkSignal` struct literals used in a compile-checked table alongside the `JDClient` interface change (no behavior yet — this phase only shapes the port). Since these are pure type additions, cover them via `status_test.go` (created in Phase 2) rather than a standalone RED here; skip straight to 1.2.
- [x] 1.2 GREEN: `internal/download/jdownloader/client.go` — add `LinkSignal{Finished, Running, Skipped bool; StatusIconKey string}` and `DestinationStatus{Matched bool; CrawlOnlineCount, CrawlOfflineCount int; Links []LinkSignal}`; add `PackageStatusByDestination(ctx context.Context, deviceName, destination string) (DestinationStatus, error)` to the `JDClient` interface; **remove** `PackagesFinished(ctx context.Context, deviceName string) (bool, error)` from the interface [design "File Changes"; download-sites "JD Status Classification by Destination Folder"]

## Phase 2: Adapter — `PackageStatusByDestination`

- [x] 2.1 RED: `internal/download/jdownloader/status_test.go` (new file) — faked `jd.JdClient` seam (extend `fakeDownloader`/`fakeLinkGrabber` per `myjd_test.go`'s pattern) asserting: (a) `SaveTo` match aggregates `CrawlOnlineCount`/`CrawlOfflineCount` from `LinkGrabber.Packages()` availability; (b) matched `Downloader.Links()` filtered by matched `PackageUuid`s populate `Links []LinkSignal`; (c) no `SaveTo` match anywhere returns `Matched=false` and zero counts, no error; (d) `normDest`/`sameDestination` table test — Windows `\` separators, trailing `/`, `.`-relative segments, case-insensitivity all normalize-equal [design "Correlate strictly by normalized SaveTo == Carpeta"; download-sites Req scenarios]
- [x] 2.2 GREEN: `internal/download/jdownloader/status.go` (new file) — `normDest(string) string` (unify `\`→`/` → `path.Clean` → trim trailing `/` → lowercase on Windows) + `sameDestination(a, b string) bool` + `myJDAdapter.PackageStatusByDestination` implementation: query `LinkGrabber.Packages()` + `Downloader.Packages()`, keep `Uuid`s whose `SaveTo` normalize-equals `destination`, aggregate crawl `OnlineCount`/`OfflineCount`, read `Downloader.Links()` filtered by matched `PackageUuid`s into `[]LinkSignal`
- [x] 2.3 GREEN (cleanup): `internal/download/jdownloader/myjd.go` — delete the `PackagesFinished` method (superseded, dead code per design)
- [x] 2.4 GREEN (cleanup): delete the now-orphaned `TestPackagesFinishedReturns*` tests from `internal/download/jdownloader/myjd_test.go` (3 tests, lines ~257-315) since the method they exercise no longer exists

## Phase 3: Pure Classifier — `classifyJDStatus`

- [x] 3.1 RED: `internal/download/service_hoster_watch_test.go` (new file) — `classifyJDStatus` truth table using plain `jdownloader.DestinationStatus` struct literals (no fakes): OFFLINE-only (`OfflineCount>0 && OnlineCount==0`) → `verdictDead`; download-stage error triad (`!Finished && !Running && !Skipped` + non-empty error-type `StatusIconKey`) → `verdictDead`; any `OnlineCount>0` → `verdictDownloading` (outvotes stale OFFLINE, self-heal case); `Running=true` → `verdictDownloading`; unmatched (`Matched=false`) → `verdictDownloading`; `Finished=true` alone → `verdictFinishedOK` (exists for completeness, never drives success) [download-sites "JD Status Classification by Destination Folder" — all 5 scenarios]
- [x] 3.2 GREEN: `internal/download/service_hoster_watch.go` (new file) — `hosterVerdict` int enum (`verdictDownloading`, `verdictFinishedOK`, `verdictDead`) + `classifyJDStatus(st jdownloader.DestinationStatus) hosterVerdict` pure function implementing the OFFLINE-only-or-error-triad rule; MUST NOT string-match `Status`

## Phase 4: Unified Watch Loop — `awaitHosterOutcome`

- [x] 4.1 RED: `service_hoster_watch_test.go` — `awaitHosterOutcome` behavior against a fake `JDClient` port + the existing fake `Counter`/`Flattener`/`Clock` test seams (reuse `service_test_helpers_test.go` fakes): (a) disk baseline exceeded before JD ever reports dead → returns success outcome, absorbing `pollCompletion`'s exact semantics (recursive-count-triggers-Flatten, then baseline recheck); (b) JD status resolves `dead` → returns a fallback outcome, asserts `RemoveByDestination` was called for the matched package, asserts `events.Bus.Publish` received an `EventNameDownloadRunProgress`-shaped event; (c) `Remove()` returns an error → outcome still advances (Warn-logged, not fatal), no panic; (d) neither disk nor dead within the fake `Clock`'s deadline → returns timeout outcome; (e) `downloading` verdict alone never triggers fallback while under `FilesystemCompletionPollTimeout` [design "Loop restructure"; download-orchestration "Dead Package Removed From JD Before Advancing", "Fallback and Failure Transitions Surface in Real Time", "Filesystem Is Success Truth, JD Status Is Failure Truth"]
- [x] 4.2 GREEN: `service_hoster_watch.go` — `awaitHosterOutcome(ctx, runID, anime, hoster string, baselineCount int) hosterOutcome` on `*Service`: single 5s-interval loop bounded by `config.FilesystemCompletionPollTimeout`, per tick — (1) disk check via `downloadedEpisodeRecursive`/`downloadedEpisodeBaseline` + Flatten-on-appear (ported unchanged from the current `pollCompletion` body) → success; (2) `s.deps.JD.PackageStatusByDestination` → `classifyJDStatus` → on `verdictDead`: call `s.deps.JD.RemoveByDestination(...)` (Warn-log on error, never abort), `s.publish(events.DownloadRunProgressEvent{...})`, return fallback outcome; (3) `ctx.Err()`/deadline → timeout outcome

## Phase 5: Rework `enqueueWithFallback` — Poll Moves Inside

- [x] 5.1 RED: extended `internal/download/service_behavior_test.go` with new `TestEnqueueWithFallback*` behavior tests using `fallbackAwareJDClient` (Phase 6): (a) top-priority hoster `AddAndStart` succeeds but `awaitHosterOutcome` reports `dead` → fallback advances to the 2nd hoster's `AddAndStart` without waiting for `FilesystemCompletionPollTimeout`; (b) every hoster dead → `enqueueWithFallback` returns `(false, FailureKindHosterDown)`, run leaves `running` promptly (no 30-min wait in the test's fake clock); (c) `AddAndStart` API error still advances (unchanged from prior enqueue-error path, plus the pre-existing `TestRunOnceFallsBackToNextHosterWhenFirstHosterEnqueueFails`); (d) disk success on the first hoster short-circuits without trying the 2nd [download-orchestration "Hoster-Ordered Enqueue" scenarios; download-sites "Failure-Cause Classification Is Telemetered" — dead-exhausted → `hoster_down` not `slow_or_timeout`]
- [x] 5.2 GREEN: `internal/download/service_pipeline.go` — reworked `enqueueWithFallback` to, per hoster: `AddAndStart` (API error → classify+continue, unchanged), then call `s.awaitHosterOutcome(...)`; on success outcome → return `(true, "")`; on fallback (dead) outcome → continue to next hoster with `lastFailureKind = FailureKindHosterDown`; on timeout outcome → continue with `lastFailureKind = FailureKindSlowOrTimeout` (naturally resolves to the LAST hoster's outcome kind once the loop exhausts, per spec: dead-exhausted is `hoster_down`, genuinely-slow-alive is `slow_or_timeout`); simplified `processAnime`'s post-`enqueueWithFallback` block — the old standalone `pollCompletion` call and its downstream `nextCount`/`downloaded` branching are now absorbed into the loop
- [x] 5.3 GREEN (cleanup): deleted the now-unused standalone `pollCompletion` method from `service_pipeline.go` (its logic is fully absorbed into `awaitHosterOutcome`; no other caller referenced it)

## Phase 6: Test Helper Fixtures

- [x] 6.1 GREEN: `internal/download/service_test_helpers_test.go` — added `PackageStatusByDestination`/`RemoveByDestination` to `svcFakeJDClient` (default `downloading`/no-match, no-op remove) and to `fallbackAwareJDClient` (per-hoster scripted `deadHosters` set + `currentHoster` tracking so Phase 5 tests can assert dead→fallback and disk-only-success paths); removed the now-interface-incompatible `PackagesFinished` methods from both fakes. **Deviation from design**: `RemoveByDestination` was added to the `JDClient` port (not explicitly listed in design's abbreviated Interfaces/Contracts section) because task 4.1(b) requires asserting the dead-package removal at the port level — the design's prose ("call `Remove()` on the matched package") needed a concrete port method since `JDClient` does not otherwise expose the raw `jd.Downloader`/`jd.LinkGrabber` `Remove` calls to orchestration.
- [x] 6.2 GREEN: `internal/download/service_catchup_test.go` — `neverFinishedCatchupJD` (embeds `recordingCatchupJD`) dropped its `PackagesFinished` override; added a `PackageStatusByDestination` override returning an unmatched (`downloading`) `DestinationStatus` (never dead, never finished) so the existing catch-up-never-completes test intent is preserved unchanged

## Phase 7: Final Gate

- [x] 7.1 `gofmt -l .` clean (no output) across all touched Go files
- [x] 7.2 `go vet ./...` clean
- [x] 7.3 `go test ./...` full suite green, including `internal/download` and `internal/download/jdownloader` packages
- [x] 7.4 `golangci-lint run` clean for all files touched by this change (repo-wide run surfaces 40 pre-existing baseline issues in unrelated files — see apply-progress deviation notes)
- [x] 7.5 `go run ./tools/checkgofilesize` — no touched file exceeds 500 effective lines (hard-fail); `tools/checkgofilesize/baseline.yaml` stays `files: []`. Some touched test files sit in the 400-500 warning band (`service_behavior_test.go` 449, `service_catchup_test.go` 457, `service_test_helpers_test.go` 415) — warnings only, non-blocking per policy.
