# Tasks: SDD-28 Automated Anime Downloading

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 4500-6000 (2 new bounded contexts, 4 tables, scheduler, full frontend feature + shared toast) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 infra+tables+crypto -> PR2 notification context+toast -> PR3 download domain+adapters -> PR4 scheduler+orchestration+bindings -> PR5 frontend |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | 4 SQLite tables + `download_jd_config` migration + DPAPI crypto seam + in-code site/hoster registry skeleton | PR 1 | Base = main (or tracker branch). Tests+DDL+docs together. ~600-900 lines. |
| 2 | `internal/notification` (Notifier, dispatcher, UI-toast, Windows desktop-toast, no-op fake) + `app.go` wiring | PR 2 | Depends on PR 1 merged (or PR1 branch if feature-branch-chain). ~500-700 lines. |
| 3 | Download domain (`decision.go`, weekday helper) + adapters (jkanime, JDClient, filesystem, config/runs stores) | PR 3 | Largest unit; may itself need splitting into 3a (domain, pure) / 3b (adapters). ~1500-2000 lines. |
| 4 | Scheduler + orchestration `Service` + Wails bindings on `App` | PR 4 | Depends on PR 2 + PR 3. ~900-1200 lines. |
| 5 | Frontend `features/download` + shared app-shell toast + `AnimePanel` gap badge + route wiring | PR 5 | Depends on PR 2 (notification.push contract) + PR 4 (Wails bindings). ~1000-1300 lines. |

Decision needed before sdd-apply starts: confirm chain strategy (stacked-to-main / feature-branch-chain / size:exception) before implementing PR 1.

---

## Phase 1: Infrastructure (Tables, Crypto, In-Code Registries)

- [x] 1.1 RED: `internal/sync/sqlite_bootstrap_test.go` — assert 4 new tables exist after `initializeBridgeDB` on a temp db (`download_hoster_priority`, `download_jd_config`, `download_schedule_config`, `download_runs`) [download-config Req: Site Registry Is Code-Resident; design §4]
- [x] 1.2 GREEN: add 4 DDL constants + `ensureDownloadJDConfigSchema` column-introspection migration to `internal/sync/sqlite_bootstrap.go`; call after `devicesDDL` block
- [x] 1.3 RED: `internal/download/crypto/crypto_test.go` (Windows-gated) — `Protect`/`Unprotect` round-trip never returns plaintext on failure [download-config Req: JD Credentials Stored Encrypted At Rest; DPAPI Security Invariants Are Windows-Gated]
- [x] 1.4 GREEN: `crypto_windows.go` (`//go:build windows`, real DPAPI `CryptProtectData`/`CryptUnprotectData`, current-user scope) + `crypto_other.go` (`//go:build !windows`, labeled non-secure fake)
- [x] 1.5 RED: `internal/download/registry_test.go` — `SiteRegistry.Resolve` returns adapter by priority/Matches, `ErrSiteUnsupported` when none [download-sites Req: Site Adapter Registry Resolution]
- [x] 1.6 GREEN: `internal/download/registry.go` `StaticRegistry` + `HosterResolver` skeleton (tie-break + unknown-after-configured rules per §4.4)
- [x] 1.7 RED: `internal/download/config/defaults_test.go` — named constants (hoster seed Mediafire=0/Mega=1, `RUN_RETENTION_LIMIT=200`, poll intervals, video exts)
- [x] 1.8 GREEN: `internal/download/config/defaults.go`

## Phase 2: Shared Notification Context

- [x] 2.1 RED: `internal/notification/dispatcher_test.go` — fan-out, one adapter failing doesn't block another/caller, no-op on zero adapters [notifications Req: Fan-Out With Adapter Failure Isolation]
- [x] 2.2 GREEN: `internal/notification/notifier.go` (`Notifier`, `Notification`, `Level`) + `dispatcher.go`
- [x] 2.3 RED: `internal/notification/ui_toast_test.go` — fake emit asserts `notification.push` payload shape; degrades when emit absent [notifications Req: UI-Toast Adapter Emits the notification.push Event]
- [x] 2.4 GREEN: `internal/notification/ui_toast.go` (mirrors `defaultObservabilityEmit`, `app.go:77`)
- [x] 2.5 RED: `internal/notification/desktop_test.go` (Windows-gated for real path) — no-op fake never counts as delivered [notifications Req: Proper Windows Desktop-Toast Adapter Behind a Build-Tag Seam]
- [x] 2.6 GREEN: `desktop_windows.go` (`//go:build windows`, vetted lib, no PowerShell) + `desktop_other.go` (`//go:build !windows` no-op)
- [x] 2.7 RED: `app_test.go` — `newNotifier` override seam injects fake `Notifier`
- [x] 2.8 GREEN: wire `notifier notification.Notifier` field + `newNotifier` in `app.go` `NewApp`/`startup` (mirrors `newDeviceStore`)

## Phase 3: Download Domain (Pure — Most-Tested First)

- [x] 3.1 RED: `internal/download/decision_test.go` — trigger decision incl. numbering-gap, NroCapVisto never consulted, disk recount after manual delete [download-orchestration Req: Online-vs-Disk Trigger Semantic; Filesystem Is the Source of Truth]
- [x] 3.2 GREEN: `decision.go` trigger function
- [x] 3.3 RED: `decision_test.go` — Spanish weekday helper table-driven (accented names, fixed `time.Time` input) — ALREADY SATISFIED by PR1's `internal/download/config/defaults_test.go` `TestSpanishWeekdayHelperReturnsAccentedNamesForFixedTime`; no duplicate test added (single home rule)
- [x] 3.4 GREEN: port `weekDaySpanish` into exported, testable helper in `decision.go`/`config` — ALREADY SATISFIED by PR1's `internal/download/config/defaults.go` `SpanishWeekdayName` (exported, accented, accepts fixed `time.Time`); no duplicate implementation added
- [x] 3.5 RED: `decision_test.go` — Tipo 1/2 explicit skip with reason; missing Pagina/Carpeta skip with reason [download-orchestration Req: Explicit Tipo 1/2 Skip; Missing Pagina/Carpeta Surfaced]
- [x] 3.6 GREEN: extend `decision.go` gating + `errors.go` sentinels (`ErrJDOffline`, `ErrNoLinks`, `ErrSiteUnsupported`, `ErrGapPageMissing`)
- [x] 3.7 RED: `registry_test.go` — `HosterResolver.Order` tie-break alphabetical, unknown-after-configured, empty-config fallback [download-config Req: Hoster Priority Is User-Orderable] — ALREADY SATISFIED by PR1's `internal/download/registry_test.go` (`TestHosterResolverOrderBreaksPriorityTiesAlphabeticallyCaseInsensitive`, `TestHosterResolverOrderPlacesUnconfiguredHostersAfterConfiguredAlphabetically`, `TestHosterResolverOrderOnEmptyConfigFallsBackToAlphabeticalNeverPanics`); verified passing, no duplicate test added
- [x] 3.8 GREEN: implement `HosterResolver.Order` deterministic ordering — ALREADY SATISFIED by PR1's `internal/download/registry.go` `hosterResolver.Order`/`OrderWithDiscovered` (design §4.4 rules 1-4 implemented exactly); verified passing, no duplicate implementation added

## Phase 4: Download Adapters

- [x] 4.1 RED: `sites/jkanime/jkanime_test.go` — CSRF/anime-ID extraction (present/missing tokens) via `httptest.Server` fixtures [download-sites Req: jkanime CSRF and Anime ID Extraction] — verified present (`TestExtractAnimeIDAndCSRFTokenSucceedsWhenBothPresent`, `...FailsWhenAnimeIDMissing`, `...FailsWhenCSRFMissing`)
- [x] 4.2 GREEN: `jkanime.go` CSRF/ID extraction — verified `Adapter` implements `sites.EpisodeSource` (`var _ sites.EpisodeSource = (*Adapter)(nil)`); removed an unused leftover `httpClientTimeout` const + `time` import flagged by golangci-lint
- [x] 4.3 RED: `jkanime_test.go` — AJAX episode listing (`total>0` vs `total==0` distinguishable) [download-sites Req: jkanime Episode Listing via AJAX] — verified present (`TestFetchEpisodesReturnsParsedListWhenTotalGreaterThanZero`, `TestFetchEpisodesTreatsZeroTotalAsNoEpisodesNotAnError`, `TestListEpisodesReturnsNoEpisodesAvailableWhenAjaxTotalIsZero`)
- [x] 4.4 GREEN: AJAX listing parse — verified implemented
- [x] 4.5 RED: `jkanime_test.go` — link extraction success + zero-links loud error [download-sites Req: Download Link Extraction Failure Surfacing] — verified present (`TestExtractLinksReturnsHosterTaggedLinksOnWellFormedServerList`, `TestExtractLinksReturnsLoudErrorWhenServersArrayMissing`, `TestExtractLinksReturnsLoudErrorWhenServersArrayIsEmpty`)
- [x] 4.6 GREEN: base64 link extraction behind `EpisodeSource` — verified implemented
- [x] 4.7 RED: `jdownloader/myjd_test.go` — `Connect` ok but `ListDevices` offline gate; 90s auto-launch poll; `AddAndStart` no package name [download-orchestration Req: Hoster-Ordered Enqueue] — verified present (`TestEnsureOnlineTreatsConnectSucceedingWhileDeviceOfflineAsOffline`, `TestEnsureOnlineLaunchesAndPollsUntilDeviceRegistersWithinTimeout`, `TestEnsureOnlineReturnsErrDeviceOfflineWhenAutoLaunchPollTimesOut`, `TestAddAndStartNeverSetsAPackageName`)
- [x] 4.8 GREEN: `jdownloader/client.go` port + `myjd.go` adapter (verified already implemented; `EnsureOnline` connect→ListDevices-gate→inject launcher→poll loop) + `launcher.go` exe resolution (NEW this batch: `ResolveExePath`/`autoreasSettingsPathFromEnv`/`resolveExePathFromFile` mirror `cmd/poc/settings.go`'s Autoreas Settings `downloader.dir` lookup; `NewExeLauncher`/`newExeLauncherWithStart` wraps resolve+`exec.Command(...).Start()` behind the `myjd.go` launcher seam — no real process spawned in tests)
- [x] 4.9 RED: `filesystem/counter_test.go` (real temp dirs) — `CountAtRoot` non-recursive vs `CountRecursive`; `Flatten` moves+removes [download-orchestration Req: Completion Detection; Flatten JD Subfolders] — 11 tests incl. `TestFlattenSurfacesErrorOnMoveFailureRatherThanSilentlySwallowingIt` (directory-collision real-fs fixture proving Flatten never swallows a move error)
- [x] 4.10 GREEN: `filesystem/counter.go` + `flatten.go` — `EpisodeCounter`/`Flattener` against `config.VideoFileExtensions`; `Flatten` deliberately diverges from `cmd/poc/finder.go`'s print-and-continue by aggregating per-file move errors via `errors.Join` and returning them (documented divergence, required by "errors observable, not silently swallowed")
- [x] 4.11 RED: `sqlite_store_test.go` (real temp SQLite via `internal/sync.OpenBridgeDB`) — hoster CRUD+seed (incl. re-seed-does-not-overwrite-user-ordering), JD config DPAPI write-only (cleartext never returned via `GetJDConfig`; Windows-gated blob-is-not-plaintext assertion; nil-password update preserves existing blob), schedule config round-trip + `MarkScheduleRun`, `OpenRun`/`FinalizeRun` incl. `ManualLink` persistence for `jd_offline`, retention prune (201 inserts → bounded to 200, oldest pruned, newest retained), crash reconciliation (open run, fresh `SQLiteStore` over same db file, `ReconcileInterruptedRuns` → `interrupted`) [download-config Req: all; download-observability Req: Durable Run History, Run History Is Bounded, Crash-Zombie Reconciliation] — 16 tests, all passing
- [x] 4.12 GREEN: `store.go` port (`DownloadStore`, `JDConfig`, `ScheduleConfig`, `ManualLink`, `DownloadRun`) + `sqlite_store.go` adapter (`SQLiteStore`, `var _ DownloadStore = (*SQLiteStore)(nil)`) against the real DDL in `internal/sync/sqlite_bootstrap.go`; `crypto.Protect`/`Unprotect` for the JD password BLOB; `FinalizeRun` prunes to `config.RunRetentionLimit` (200) in the SAME transaction; `ReconcileInterruptedRuns` finalizes `finished_at_ms IS NULL` rows as `interrupted`. Deviation: added a `DownloadStore.DecryptedPassword` method beyond the literal design.md §3.6 signature list, to give the JD adapter (a later wiring phase) a dedicated plaintext-retrieval seam without ever exposing it through `GetJDConfig`. `SeedHosterPriorityIfEmpty` is implemented as a true count-then-seed-only-if-empty operation; it does not conflict with `sqlite_bootstrap.go`'s existing auto-seed-on-bootstrap for site "jkanime" — both are idempotent no-ops once a site has rows, so calling the store method after bootstrap has already seeded is safe and a no-op.

## Phase 5: Scheduler

- [x] 5.1 RED: `schedule/scheduler_test.go` (fake clock) — enabled/disabled gating, next-boundary computation [download-scheduler Req: Schedule Is Gated by Persisted Config] — 5 `nextDailyBoundaryAfter` tests (today/tomorrow-roll/exactly-now-rolls/malformed-HHMM/timezone-sane UTC-vs-America-New_York) + 2 gating tests (`TestSchedulerDoesNotInvokeRunCallbackWhenScheduleDisabled`, `TestSchedulerInvokesRunCallbackWithScheduledTriggerWhenDue`) — confirmed RED via `undefined: Timer/nextDailyBoundaryAfter/NewScheduler/Deps`
- [x] 5.2 GREEN: `internal/download/schedule/scheduler.go` — `nextDailyBoundaryAfter` (strict `HH:MM` parse, rolls to tomorrow when the boundary has passed OR equals `now` exactly) + `scheduler.loop` (injected `Clock`/`Timer` seam, NO real sleeping; reads `ConfigStore.GetScheduleConfig` each iteration; disabled → idle-interval re-check so a UI enable takes effect without restart; enabled → `sleepUntil` the next daily boundary via the fake/real `Timer`)
- [x] 5.3 RED: `scheduler_test.go` — concurrent-run guard `ErrRunInProgress` on manual+scheduled overlap [download-scheduler Req: Concurrent-Run Guard] — `TestScheduledTickDuringActiveRunIsSkippedSilently` (a second scheduled tick during an active run never reaches `run()`) + `TestTriggerNowReturnsErrRunInProgressWhenAManualRunIsActive` (`errors.Is(err, ErrRunInProgress)`)
- [x] 5.4 GREEN: `running atomic.Bool` guard (`acquire`/`releaseGuard`) + `TriggerNow` (returns `ErrRunInProgress` on overlap) + `fireScheduledTick` (logs+skips silently on overlap, never surfaces an error) + `Status(ctx)` next/last-run/last-status/running accessor (`TestNextLastRunAccessorsReflectScheduleConfigAfterMarkScheduleRun`)
- [x] 5.5 RED: `scheduler_test.go` — bounded `Stop()` drain, run max-duration guard releases lock, poll loops honor `ctx.Done()` [download-scheduler Req: Bounded Shutdown Drain and Run Max-Duration Guard] — `TestStopReturnsWithinDrainBoundEvenWithAnInFlightRun` (run blocks on `<-ctx.Done()` forever if not cancelled; `Stop()` must still return well under 1s) + `TestRunExceedingMaxDurationReleasesTheConcurrentRunGuard` (wedged run unblocked ONLY by the `MaxRunDuration` context deadline; guard releases and a subsequent `TriggerNow` succeeds)
- [x] 5.6 GREEN: `Stop()` (`stopOnce`-guarded: cancels `loopCancel` + `runCancel`, waits at most `ShutdownDrainWait` (default 5s) on the run's done-channel before abandoning, then waits the same bound on `loopDone`) + `acquire()` wires `context.WithTimeout(ctx, maxRunDuration)` (default 2h) onto every run context so a wedged run's own deadline fires and `releaseGuard` runs regardless of caller; `sleepUntil`/loop `select` on `ctx.Done()` throughout (no unconditional sleep anywhere)

## Phase 6: Orchestration Service

- [x] 6.1 RED: `service_test.go` (all-fakes) — fan-out failure isolation, run status `partial` on mixed success/fail [download-orchestration Req: Per-Anime Fan-Out With Failure Isolation] — confirmed RED via `undefined: ServiceDeps`; 8 tests total incl. `TestRunOnceIsolatesPerAnimeFailureAndMarksRunPartial`
- [x] 6.2 GREEN: `service.go` `NewService`/`ServiceDeps` + fan-out loop (`execute`/`processAnime`) — all-fakes test suite passing
- [x] 6.3 RED: `service_test.go` — JD-offline degradation persists `manual_links_json` as `contracts.ManualLink`; notifier called [download-orchestration Req: User-Notable Moments; download-observability Req: JD-Offline Manual Links Persistence] — `TestRunOnceDegradesToJDOfflineAndPersistsManualLinks`
- [x] 6.4 GREEN: JD-offline branch (`!jdOnline` builds `ManualLink` instead of enqueueing) + `Notifier.Notify` calls for completed/failed/jd_offline/skipped (`s.notify`), notifier failures never fail the run (`TestRunOnceSurvivesNotifierFailure`)
- [x] 6.5 RED: `service_test.go` — skip accounting (`skipped_count` excluded from `animes_checked`), failure-kind classification (captcha/hoster_down/slow_or_timeout) [download-observability Req: Skip Accounting; download-sites Req: Failure-Cause Classification] — `TestRunOnceAccountsSkipsSeparatelyFromAnimesChecked`
- [x] 6.6 GREEN: `SkippedCount`/`AnimesChecked` counters + `FailureKindCaptcha`/`FailureKindHosterDown`/`FailureKindSlowOrTimeout` constants + `classifyEnqueueFailure` in `service.go`
- [x] 6.7 RED: `service_test.go` — assert no `AnimeWriteService` call exists/used anywhere [download-orchestration Req: No Write-Back to the Anime Context] — `TestServiceDepsHasNoAnimeWriteServiceDependency` (type-assertion against `contracts.AnimeWriteService` must fail)
- [x] 6.8 GREEN: confirmed `ServiceDeps.Animes contracts.AnimeQueryService` only (structural assertion passing, no write dependency exists)
- [x] 6.9 RED: `events/event_test.go` — new `download.*` event constants/structs [download-observability Req: Download Events on the Event Bus] — `TestDownloadEventConstantsMatchObservabilitySpecNames` + 3 `...SatisfiesEventInterface` tests
- [x] 6.10 GREEN: added 7 `download.*` event constants + structs (`DownloadRunStartedEvent`, `DownloadRunFinishedEvent`, `DownloadEpisodeAvailableEvent`, `DownloadEpisodeDownloadedEvent`, `DownloadFailedEvent`, `DownloadSkippedEvent`, `DownloadJDStatusEvent`) to `internal/events/event.go`; wired `Service.publish` to fan these out on the `Bus` at every notable moment (run start/finish, episode available/downloaded, failed, skipped, JD status)
- [x] 6.11 RED: `app_test.go` — `GetDownloadConfig`/`SetHosterPriority`/`GetJDStatus`/`SetJDConfig`/`GetScheduleConfig`/`SetScheduleConfig`/`TriggerDownloadCheck`/`ListDownloadRuns` degrade on nil deps, never panic [design §9] — 8 nil-degradation tests + 7 positive-path delegation tests (incl. `TestTriggerDownloadCheckSurfacesErrRunInProgress`) in `app_test.go`
- [x] 6.12 GREEN: implemented all 8 bindings in `app_download.go` (contracts DTOs added: `DownloadConfig`, `JDStatus`, `JDConfigInput`, `ScheduleConfig`, `ManualLink`, `DownloadRunView`, `HosterPriorityItem`) + `newDownloadStore`/`newDownloadService`/`newDownloadScheduler` override seams on `App` + `reconfigurableJDClient` composition-root wrapper (rebuilds the real `jdownloader.JDClient` from the store's current `JDConfig`/`DecryptedPassword` whenever email/device changes, since `jd.NewClient` bakes credentials in at construction) + `startup()` calls `ReconcileInterruptedRuns` before `Scheduler.Start` (`startDownloadOrchestration`) + `shutdown()` calls `Scheduler.Stop()`. Deviation: fixed 12 pre-existing `app_test.go` startup tests that passed a bare uninitialized `&sql.DB{}` and panicked once `startDownloadOrchestration` issued a real query against it — added `newDownloadStore` fake overrides to each (same convention as the existing `newDeviceStore` override in every one of those literals).

## Phase 7: Frontend

- [x] 7.1 Scaffold `frontend/src/features/download` via `bun --cwd="frontend" run generate:feature download HosterPriorityEditor` (repeat scaffolding per UI surface)
- [x] 7.2 RED+GREEN: `use-hoster-priority.ts` + `HosterPriorityEditor.tsx` (`__tests__` first) — drag & drop primary reorder + keyboard reorder fallback + ARIA live announcement; use the React Aria / HeroUI v3 accessible drag-and-drop primitive, not a bespoke impl [download-ui Req: Hoster Priority Editor]
- [x] 7.2b RED+GREEN: apply the 2026 design-pattern quality bar across every download surface + shared toast — HeroUI v3 tokens (no ad-hoc styling), explicit loading/empty/error states, responsive + accessible [download-ui Req: Modern 2026 Design-Pattern Quality Bar]
- [x] 7.3 RED+GREEN: `use-jd-config.ts`/`use-jd-status.ts` + `JDConfigPanel.tsx` — password write-only, never pre-filled [download-ui Req: JD Config Panel With Write-Only Password; JD Live Status Indicator]
- [x] 7.4 RED+GREEN: `use-schedule-config.ts` + `SchedulePanel.tsx` [download-ui Req: Schedule Panel]
- [x] 7.5 RED+GREEN: `use-download-runs.ts` + `RunHistoryPanel.tsx` master/detail incl. manual links [download-ui Req: Run History Master/Detail]
- [x] 7.6 RED+GREEN: `use-download-trigger.ts` + `ManualTriggerButton.tsx` loading/in-progress state [download-ui Req: Manual Trigger Button]
- [x] 7.7 RED+GREEN: `frontend/src/infrastructure/notification-source.ts` (mirrors `observability-log-source.ts`) [notifications Req: Frontend Renders notification.push Via a Shared Toast Surface]
- [x] 7.8 RED+GREEN: `use-notification-toasts.ts` app-shell hook + `NotificationToasts` shell component mounting HeroUI `Toast.Provider`; keep `AppLayout.tsx` hook-free
- [x] 7.9 RED+GREEN: per-anime gap badge in existing `features/anime/ui/AnimePanel` for missing Pagina/Carpeta [download-orchestration Req: Missing Pagina/Carpeta Surfaced as Actionable State (UI half); design.md §10 — gap badge lives inside existing AnimePanel as a filter/badge, not a new component]. Unblocked the prior cross-phase gap (no Wails binding exposed Pagina/Carpeta presence) with a minimal, read-only, additive Go change: `contracts.AnimeListItem` gained `HasDownloadPage bool`/`HasFolder bool` (presence-only booleans, raw URL/path NOT exposed); `anime.QueryService.ListAnimeItems` populates them via `hasNonEmptyLegacyString(*string)` (nil-or-empty check, mirrors the existing convention in `internal/download/decision.go`). RED test `TestQueryServiceListAnimeItemsDerivesDownloadGapBooleans` (`internal/anime/service_test.go`) covers present/absent/empty-string/explicit-null cases. Frontend: `Anime` DTO mirror (`shared/contracts/anime.types.ts`) + zod schema extended; `AnimeViewModel` gained `hasDownloadPage`/`hasFolder`/`hasDownloadGap`/`gapLabel` (derived via new `getAnimeGapLabel` helper); `AnimeFilterState` gained a `gap` filter (`all`/`missing`/`complete` via new `matchesAnimeGap` helper + `ANIME_GAP_*` constants); `AnimeFilterBar` gained a "Filter by download gap" Select; `AnimePanel` renders a warning-colored `Chip` gap badge (`data-testid="anime-gap-{id}"`) next to the status chip when `hasDownloadGap`. Wails TS bindings regenerated via `wails generate module` to pick up the new `AnimeListItem` fields (also picked up previously-missing Phase 6 download bindings in `App.d.ts`/`App.js` as a side effect — purely additive, no behavior change).
- [x] 7.10 GREEN: add download route under `frontend/src/app/routes/`; verify no toast/`notification.push` listener exists inside `features/download` [download-ui Req: Toasts Are Not Owned by the Download Feature]

## Phase 8: Integration/Verification

- [x] 8.1 Verify `decision.go`, `registry.go`, store, scheduler, service all wired through `app.go` `new*` seams with no nil-deref on missing deps — confirmed: `startDownloadOrchestration` (app.go:430) wires all via `new*` seams; 3 download nil-degradation tests in `app_test.go` pass; `go vet ./...` clean
- [x] 8.2 Run `go test ./...` full suite incl. Windows-gated DPAPI/desktop-toast assertions; run frontend `__tests__` via Bun — `go test ./...` all green (download 76.3%, config 100%, crypto 88.5%, filesystem 93.3%, jdownloader 75.3%, schedule 80%, jkanime 80.2%, notification 72.7%); frontend `bun run test` 330/330 across 45 files
- [x] 8.3 Validate jkanime adapter against recorded real fixtures (no live network in CI) — jkanime adapter tests drive CSRF/AJAX/link-extraction via `httptest.Server` fixtures, no live network
- [x] 8.4 Confirm `download_runs` retention prune (201st run drops oldest) and `ReconcileInterruptedRuns` ordering before `Scheduler.Start` in `app.go startup` — `TestSQLiteStoreFinalizeRunPrunesToRetentionLimit` passes; app.go:462 `ReconcileInterruptedRuns` runs before app.go:478 `downloadScheduler.Start`, and `Stop()` in shutdown (app.go:500)
