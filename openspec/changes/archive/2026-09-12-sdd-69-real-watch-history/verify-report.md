# Verify Report — SDD-69 Real Watch History

### Verdict

**PASS WITH WARNINGS**

The warnings are the three findings named at the end, stated rather than folded into a green suite. Verified by
the orchestrating agent directly, not delegated (CLAUDE.md #3). Branch `feat/sdd-69-real-history`, head `eda3f43`
at verification.

History used to be a projection of each anime's current snapshot. It is now a permanent log with one row
per episode watched, recorded from the before/after diff of every progress write on both the desktop and
mobile paths, backfilled once from the audit log, and read by a day-grouped `/history` timeline and a
per-anime section on Anime Detail. All tasks across the nine planned slices (run as eleven work units)
are closed.

## Evidence

| Check | Result |
|---|---|
| `go test ./...` (`-p=4`) | clean, 46 packages ok |
| `go vet ./...`, `gofmt -l internal tools main.go` | clean, 0 files |
| golangci-lint, both profiles (`scripts/lint.ps1 -Profile all`) | 0 issues, 0 issues |
| `tools/checkarchitecture` | clean |
| `tools/checkgofilesize` | passed, baseline still `files: []` |
| Frontend suite | **2625 passed / 2625**, 300 files |
| `tsc --noEmit` | clean |
| `fallow audit` | exit 0 (advisory token-drift warnings only, all in untouched `AppLayout.tsx`) |
| `render:smoke`, `layout:smoke` | the production bundle paints on every checked route; layout fixtures pass |
| `git diff 7b6e055 HEAD -- docs/openapi.yaml` | empty: desktop-only Wails surface, no wire change |
| `wails build` | exit 0 → `build/bin/autoreas-bridge.exe`, 21 MB, 28 s |
| `wails dev` (APPDATA pointed at a sandbox copy of the real database) | WebView2 created, `http server listening on [::]:9876`, 34115 serves 200; `/history` and Anime Detail screenshotted rendering real rows |

## Runtime proof on real data (sandbox copy, never the live database)

The first `wails dev` launch against a pristine copy ran the backfill during bootstrap: **201 rows over 36
anime**, the `watch-history-backfill` marker set, a restore point written beside the database, 277
navigation rows purged (671 → 394 audit rows). The same numbers came out of a standalone `OpenBridgeDB`
run earlier. Both repeated anime hold only cycle-2 rows, and that is correct rather than suspicious: the
log holds no progress before either reset. It also means the flawed replay in `explore.md` §4.1 landed on
the same 201 by coincidence, since there was nothing for its cycle-blind retraction to erase.

`/history` rendered day headings with counts ("September 11, 2026 (4)") and one row per episode with its
time; Anime Detail for Date a Live II rendered its "Episode history" beside the repetition timeline.

## Requirements → what proves them

### watch-history

| Requirement | Proof |
|---|---|
| Recording Is Diff-Derived | `TestEnsureWatchHistoryBackfillReplaysRealisticFixtureAndPurgesNavigationRows` (a zero-delta navigation row records nothing whatever its `action_type`); `Derive` never reads the action |
| A Forward Step Inserts One Row Per Newly Reached Episode | `TestApplyStepSequences` rows |
| A Backward Step Retracts Every Recorded Episode Above The New Value | `TestApplyStepSequences` "a retraction above the floor…" |
| A Zero-Delta Write Records Nothing | `TestDeriveGuardOrder` "an equal before and after value is a no-op" |
| Fractional Progress | `TestDeriveGuardOrder` half-step rows; `TestApplyOscillationLeavesSameSetWithNewRowIdentity` |
| A Retraction Below The Log's Floor Is A No-Op | `TestApplyStepSequences` "…below the log's floor is a no-op" |
| An Episode Is Never Recorded Twice Within A Cycle | `TestApplyConflictingInsertIsANoOpCountedAndWarnLogged`, `TestUniqueEpisodeIndexRejectsDuplicateWithinOneCycle` |
| A Cycle Reset Records Nothing And Retracts Nothing | `TestEpisodeServiceRepeatAnimeRecordsCycleResetAndLeavesWatchHistoryUnchanged` |
| Retraction Is Scoped To One Cycle | `TestApplyStepSequences` "a rollback in cycle 2 never touches cycle 1's rows" |
| The Backfill Anchors Cycles To The Current Repetition Count | `TestCycleTrackerAnchorsBackwardsFromRepetitions` (R=3 K=0 first, R=1 K=1, K>R clamp, no snapshot); live-write agreement in the realistic-fixture test; `TestNewCycleTrackerLogsOnlyWhenResetsExceedRepetitions` |
| `SetAnimeDays` Records Nothing | `TestEpisodeServiceSetAnimeDaysWritesDias` asserts zero recorder calls |
| The Anime Name Is Denormalized At Record Time | `TestAnimePageKeepsEachRowsRecordedName` (added at verification); reads never join the anime table, so a deleted anime's rows stay readable by construction |
| Read Models Are Keyset-Paged | `TestPagePagesNewestFirstWithoutGapOrDuplicate`, `TestPageEqualTimestampTiebreaksById`; `TestAnimePageQueryPlanSeeksTheAnimeIndex` (added at verification) requires `EXPLAIN QUERY PLAN` to name `idx_watch_history_anime` and never `SCAN` |
| Per-Anime History Surfaces On Anime Detail | `AnimeWatchHistory.test.tsx` (rows, truncation notice, three states); `use-anime-watch-history.test.ts` (anime-scoped fetch, stale response ignored); `AnimeDetail.test.tsx` "renders the per-anime watch history section beside the repetition timeline" |
| Back Navigation From Detail No Longer Restores List State | `use-anime-detail.test.tsx` both `onBack` branches; nothing needed changing |
| Retention Is Permanent | by omission: `internal/watchhistory` has no prune path, in contrast to the audit log's explicit cap |
| The Backfill Is Marker-Guarded And Idempotent | `TestEnsureWatchHistoryBackfillIsMarkerGuardedAndIdempotent`, `TestWatchHistoryBackfillDoneTreatsZeroEpochAsNotDone` |
| The Backfill Creates A Restore Point Before Mutating | the realistic-fixture test now opens the restore point and requires all 4 audit rows, including the one the purge removed (added at verification); `…FreshInstallSetsMarkerWithoutRestorePoint` for the negative |

### anime-history

| Requirement | Proof |
|---|---|
| Episode Timeline Is Grouped By Day | `HistoryTimeline.test.tsx` heading-with-count and newest-first rows; `watch-history.helpers.test.ts` grouping, partial trailing day, page-boundary fixture |
| The Whole Row Drills Down To Anime Detail | `HistoryTimeline.test.tsx` "navigates to the anime detail when a row is activated anywhere in the row" |
| Loading, Empty, and Error States Are Exclusive | three `HistoryTimeline.test.tsx` cases, each asserting the negative |
| The List Renders Progressively | `HistoryTimeline.windowing.test.tsx` (50 rows, one near-bottom scroll → 100); in-flight guard in `use-history-timeline.test.ts` |
| The History Route Carries No Persisted Query State | `history-route-query-state.test.tsx` |
| History Timestamps Read Well | `formatDayHeading` / `formatRowTime` pinned from the same `watchedAtMs` |
| History Is Its Own Top-Level Section | `App.test.tsx` route and nav cases |
| English UI Copy with Spanish Data Literals Preserved | English copy pinned by exact strings; the Spanish-literal scenario has nothing to bind to, since no row renders a Spanish data literal |

### observability (modified)

| Scenario | Proof |
|---|---|
| Runtime-event persistence never writes the audit log | `TestEventPersistenceWritesOnlyRuntimeEvents` snapshots every table |
| Navigation telemetry no longer lands in the audit log | `app_desktop_actions_test.go` via `assertDesktopActionEvent` (domain `anime`, dotted event type, correlation id carried over) |
| The audit log is pruned beyond its cap | `TestRecordActivityFirstWritePrunesUnconditionally`, `TestRecordActivityPrunesOnCadenceNotEveryWrite`, `TestRecordActivityRollsBackAFailedInsert` |

## Verified by breaking production

Each break was applied with `perl`, confirmed by a non-empty `git diff`, run, and reverted to a zero diff.

| Break | Result |
|---|---|
| Skip `CreateRestorePoint` in the backfill | realistic-fixture test fails: `expected one restore point taken before the replay, got []` |
| Re-key `idx_watch_history_anime` to `(source)` | query-plan test fails: the plan falls to `idx_watch_history_episode` plus `USE TEMP B-TREE FOR ORDER BY` |
| `pruneEvery <= 0` → `<= 1` | cadence table fails: `[1 2 3], want [1 1 1]` |
| Deferred rollback condition inverted | rollback test fails: the next write hits its 5 s deadline on the leaked connection |

## Mutation

Run after each commit in a clean detached worktree. `ditto changed` carried `go test -timeout 60s`; Stryker was
run by hand. Go: watchhistory 0.91, anime 1.00, desktop 1.00, sync 0.95, activity 1.00 then 0.84 on the
retention cap (four survivors, all ±1 on the `5000`/`200` defaults). Frontend: `use-history-timeline.ts` 69% → 89% after
6b killed the 6a survivors, `HistoryTimeline.tsx` 89%, Anime Detail section 90%, adapter and day-grouping helpers
100%.

## Findings

1. **The frontend mutation gate measured nothing on this change.** `test:mutation:staged` printed "no staged
   production TypeScript lines" in 0.3 s on commits that staged new `.ts`/`.tsx`, and Stryker run by hand on
   the same lines found 13 survivors. A throwaway repository ruled out git's hook environment; the root cause
   is unknown and outside this change. Logged in `docs/learning-log.md`.
2. **Five work units exceeded the 600-line cap.** Slices 1, 2, 3 and 6a went through ledger resets under the
   owner's standing authorization, each after a measured refactor; slice 7 was the declared deletion exception.
   The units re-planned smaller before they started (4a at 167 lines, 4b at 178) landed under their forecasts.
3. **The History empty states reuse the Today Airis artwork**, because no History artwork exists. Follow-up:
   a `history.webp` asset and its layout fixture entry.

Gate drift caught during verification and fixed: a comment naming the audit log's table in a `.ts` file passed
the commit gate (the `architecture` job is globbed to Go files) and was caught only by running
`checkarchitecture` by hand.
