# Proposal — SDD-61 Download Attempt Observability

Change: `2026-08-29-sdd-61-download-attempt-observability`
Exploration input: `openspec/changes/2026-08-29-sdd-61-download-attempt-observability/explore.md` (Engram `sdd/2026-08-29-sdd-61-download-attempt-observability/explore`, observation #8789)
Delivery: `execution_mode=auto`, `artifact_store=openspec`, `delivery_strategy=single-pr`, `review_budget_lines=400`, `strict_tdd=true`.

> **Deliberate override of the `sdd-propose` 450-word budget.** `openspec/config.yaml` `rules.proposal` requires a rollback plan and identified modules, and this change's acceptance criterion — *"a good metric is one that helps you make a specific decision"* — requires a per-field justification table. Both are below. The document is still an order of magnitude shorter than SDD-60's.

---

## 1. Intent

Run `run-dl1532pqkk3g` (2026-08-28) reported "3 episode(s) downloaded" through a broken path, and bridge's own persisted log could not show it. Mediafire finished all three episodes; bridge classified it `dead` twice, destroyed its two FINISHED packages via `jdRemove` → `RemoveByDestination`, and credited the files to a mega.nz fallback that transferred zero bytes. **Not one of the run's 15 persisted events records those two destructive removals.**

Closing the case required three records external to bridge: JDownloader's `DownloadWatchDog` log, NTFS `CreationTime`, and arithmetic over event spacing. This change makes the next investigation need only bridge.

**Scope is instrumentation only.** It records what the orchestrator already knows at the instant it decides. It changes no verdict, no branch, and no outcome.

---

## 2. Scope

### 2.1 In scope

Ordered by irrecoverability — facts that exist only at the instant of observation come first.

| # | Deliverable | Emit site |
|---|---|---|
| **1** | **Probe timeline.** `detectDownloadStartPhase` returns `[]probe{atMs, found}` in place of the discarded `*hosterOutcome`. One event per attempt, never one per probe. | existing `download.detect_start_failed` (`service_hoster_watch.go:232`) |
| **1b** | **Scope addition — persist the SUCCESSFUL detect path.** `download.episode_downloading` has **zero persisted rows, ever** (`detectDownloadStartPhase:118` only publishes on the bus). A new `info` `download.detect_start_succeeded` carries the same probes array. | new, in `detectDownloadStartPhase` |
| **2** | **JD status observed before every `jdRemove`.** New `warn` `download.jd_removed` on **every** removal — today a *successful* destructive removal logs nothing at all. | `service_hoster_watch.go:146, 248, 255, 265` |
| **3** | **`exit` + `hoster` + `attemptIndex` + `baseline` + `observed` on `download.episode_downloaded`.** The only widening: `hosterOutcome` gains `exit` and `observed`; `enqueueWithFallback` returns a small struct instead of `(bool, string)`. Also enriches the existing episode-level `download.failed`. | `service_pipeline.go:192` and `:183` |
| **4** | **Per-attempt ledger.** New `info` `download.hoster_attempt` on all three switch branches — the switch already holds `i`, `hl.hoster` and `outcome.kind`, and already logs dead and timeout but **not success**. | `service_pipeline.go:351-364` |

### 2.2 Out of scope — and why the boundary matters

| Deferred | Reason |
|---|---|
| **D1** — `evaluateJDAfterGrace` declaring a finished download dead | Behavior. |
| **D2** — the fallback hoster credited for the previous hoster's bytes | Behavior. |
| **D3** — the `.part` probe race (three probes at t=20/40/60s) | Behavior. |
| `duration_ms` | Does not clearly pass the "specific decision" test. `LogEntry.DurationMs` is already a first-class column (`eventlog/store.go:43`, `nullableDuration`), so adding it later is purely additive. |
| Any change to `internal/events/event.go` | Bus events are **not persisted**. A field added there reaches the UI and mobile and leaves the forensic log unchanged. |
| Any change to `openspec/specs/download/orchestration.md` | That file is behavior. |
| Metadata-dimension filtering in `eventlog` | `EventFilters` has no metadata dimension (R-3 below routes around it instead). |
| **Any new field on `animeRunOutcome`** (`service.go:196`) | **Hard rule — see §2.3.** |

### 2.3 Hard rule — `animeRunOutcome` MUST NOT be widened

`internal/download/service.go:196`. No field is added to it by this change. Three independent reasons, each verified against the source:

1. **It is the wrong audience.** The struct's own field comments state its purpose — `firstEpisodeDownloaded`/`lastEpisodeDownloaded` exist *"so a notification row can say 'Episodes 14-16' instead of only '3 episodes'"*. It builds user-facing notification rows. Per-attempt forensic data is a different audience with a different lifetime. **If apply ever feels pressure to hang `winningHoster` or `exit` on this struct, the signal is that the emit site is wrong, not that the struct needs widening.**
2. **It is not one struct, it is two.** `service.go:228` declares `type animeProgressDelta = animeRunOutcome` — a type **alias**, not a distinct type. Widening `animeRunOutcome` silently widens the live progress-delta channel as well: 19 `animeProgressDelta` references in `service_pipeline.go` alone, 27 across five files. A forensic field would leak into the progress fan-out that feeds the UI.
3. **Collision avoidance with SDD-60.** `internal/download/service_notification_rows.go` couples to `animeRunOutcome` and to nothing else in this change's blast radius — verified: 11 lines referencing `animeRunOutcome`, **zero** referencing `hosterOutcome` or `enqueueWithFallback`. SDD-61 and SDD-60 (45 tasks pending) stay disjoint exactly as long as that struct is not widened.
4. **Size.** `internal/download/service.go` is 541 raw lines — the largest file in the package. Widening the struct drags this change into it for no benefit.

The recommended shape already respects this: `enqueueWithFallback`'s result struct is consumed **locally inside `processAvailableEpisode`** to build the `logf` metadata map, and is never stored on the outcome. `sdd-tasks` and `sdd-apply` inherit this rule.

**Why the boundary is load-bearing, not bureaucratic:** without the probe timeline and the `exit` discriminator you **cannot verify a future D1 fix**. You would be reconstructing it by arithmetic from event spacing — which is exactly what forced the original investigation to depend on JDownloader's log and NTFS timestamps. Instrumentation first is what makes the behavior change provable.

**R-7, restated as a hard rule:** item 3's `observed` disk count is one `downloadedEpisodeBaseline` call away from being the D1 fix. It is **RECORDED AND NEVER ACTED ON**. No branch, no guard, no early return reads it. The spec MUST state this and a test MUST pin it.

---

## 3. Metric justification — every field, and the decision it enables

A field with no decision behind it is cut.

| Event | Field | The specific decision it enables |
|---|---|---|
| `detect_start_failed` / `detect_start_succeeded` | `probes[{atMs,found}]` | **Is the defect the probe strategy (D3) or the classifier (D1)?** Successes clustering on the 3rd probe → the 60s window is too short, extend it. All three `found:false` while the file did land → the `.part` predicate is wrong, change the predicate, not the schedule. |
| `jd_removed` | `stage` | **Which of the four removal sites destroys finished work.** Also written into the message text, because metadata is not filterable (R-3). |
| `jd_removed` | `statusKnown` | **Was the removal blind or evidence-based?** Site `:248` has no status by construction. |
| `jd_removed` | `verdict`, `crawlOnline`, `crawlOffline`, `packages`, `links`, `anyFinished`, `anyRunning` | **Was the destructive removal justified?** `anyFinished:true` + `verdict:dead` is the exact `run-dl1532pqkk3g` signature and would have closed the case from bridge's log alone. |
| `episode_downloaded` / `failed` | `exit` | **Was the success OBSERVED or INFERRED** — the central question this change exists to answer. Also answers "was the file renamed": exit `disk_ahead_at_entry` skips `completeDownloadedEpisode` entirely (no rename), exit `fs_poll_confirmed` renames — which is what `downloadedEpisodeBaseline` later reads. |
| `episode_downloaded` / `failed` / `hoster_attempt` | `hoster`, `attemptIndex` | **Which hoster to demote in the priority list**, and whether the first hoster fails systematically (list order is wrong) or fallback is quietly doing all the work. Comparing `hoster` here against the `hoster_attempt` ledger is what exposes D2. |
| `episode_downloaded` / `failed` | `baseline`, `observed` | **Is D1 real, and how often?** A `dead` verdict recorded alongside a disk count that had already advanced is D1, visible after the fact, without the code ever branching on it. This is what sizes the follow-up fix. |
| `hoster_attempt` | `outcome`, `exit` | **How many attempts does a typical episode cost, and which one won?** A uniform one-row-per-attempt ledger; the existing `download.failed` emits stay the failure-**taxonomy** channel (`sites.md` mandates `Metadata.failureKind` there) and are left byte-identical. |

**Cut for having no decision behind it:** probe count (the array length already carries it), wall-clock timestamps duplicating `occurred_at_ms`, and any per-probe event.

---

## 4. Capabilities

> Contract with `sdd-spec`. Delta paths mirror `openspec/specs/` (SDD-60 precedent).

### New capabilities

**None.** This extends existing download observability.

### Modified capabilities

- **`download/observability.md`** → `openspec/changes/.../specs/download/observability.md`. `ADDED` requirements: (a) per-attempt forensic record — every hoster attempt MUST persist its terminal `exit`, hoster and attempt index through `logf`; (b) every `jdRemove` MUST persist the JD status it observed, or record that it observed none; (c) the probe timeline MUST be persisted on **both** the failed and the successful detect path; (d) the recorded-never-acted-on rule for `observed` (R-7).
- **`download/sites.md`** → `openspec/changes/.../specs/download/sites.md`. `MODIFIED` — `Requirement: Failure-Cause Classification Is Telemetered` already mandates `Metadata.failureKind`; it gains the per-attempt hoster ledger alongside it. The delta MUST carry the full requirement including its three unchanged scenarios.

### Explicitly NOT modified

`download/orchestration.md`, `download/config.md`, `download/scheduler.md`, `download/ui.md`, `docs/openapi.yaml`, the mobile sync contract. This change adds **no** REST/WS surface and **no** bus-event field.

---

## 5. Approach

Every new field goes through a `logf` metadata map — the only fan-out that reaches `runtime_events` (`service_effects.go:114` → `FanoutLogger.write` → `eventlog.Sink` → `SQLiteStore.InsertEvent`). `s.publish` reaches live subscribers only and is never persisted; that asymmetry is by design and is not touched here.

Three of the four items are **local**. Only item 3 changes a signature.

- **Item 1** — `detectDownloadStartPhase` returns `(bool, []probe)`. `awaitHosterOutcome:200` stops discarding the second value and forwards it into `evaluateJDAfterGrace`, which attaches it to the `download.detect_start_failed` it already emits. The success emit lives in `detectDownloadStartPhase` itself, where the positive probe is. `atMs` is **relative to the attempt's enqueue**, sourced from `s.deps.Clock()` — see R-6.
- **Item 2** — `jdRemove` takes a nil-able status summary and logs `download.jd_removed` unconditionally, before delegating to `RemoveByDestination`.
- **Item 3** — `hosterOutcome` gains `exit` and `observed`; every terminal `return` stamps them. `enqueueWithFallback` returns `{succeeded, failureKind, hoster, attemptIndex, exit, baseline, observed}`. **That struct is unpacked into a `logf` metadata map inside `processAvailableEpisode` and discarded there.** It is never assigned to `outcome`, never passed to `emitProgress`, and never crosses into `animeRunOutcome` (§2.3).
- **Item 4** — one `logf` inside the existing switch. Zero plumbing.

**Rejected:** a mutable accumulator threaded by pointer. It adds a second control-flow channel, contradicts package style, and buys nothing once items 1, 2 and 4 are local.

### 5.1 Two corrections to the exploration's exit table

1. **The table lists 9 terminal points; there are 13.** It omits the three fallback-timeout mirrors at `:240` (JD nil, not first hoster), `:251` (query error, not first) and `:268` (no positive signal, not first). Collapsing those into one undistinguished `timeout` loses exactly the discriminator item 3 exists to provide. Add `enqueueWithFallback`'s four pre-attempt exits (`jd_unavailable` `:324`, `cancelled_before_attempt` `:335`, `enqueue_error` `:344`, `no_hosters` — empty `ordered`, loop never runs) and `exit` is a **closed enum of 17 values**: 13 watch-layer (the `:221` split below counts twice; the `:261` proceed-true sentinel is NOT stamped and is excluded) plus 4 pipeline. Design finalizes the names. NOTE: the enqueue-error site is a `continue`, not a `return` -- terminal only when it fires on the LAST hoster; and the empty-`ordered` fall-through SHARES its return statement with the exhausted-chain case, so `no_hosters` needs its own value or "the extractor produced nothing" is indistinguishable from "every hoster failed".
2. **Exit `:221` folds two causes into one return** — `s.deps.Clock().After(deadline) || ctx.Err() != nil`. A user pressing Stop and a genuine 30-minute timeout are different decisions; split them.

Also: `evaluateJDAfterGrace:261` returns the sentinel `hosterOutcome{}` on the proceed-true path. It MUST NOT be stamped with a real `exit` — that value is never surfaced, and stamping it would make the field lie.

---

## 6. Affected areas

| Area | Impact | What changes |
|---|---|---|
| `internal/download/service_hoster_watch.go` | **Modified** | `probe` type; `detectDownloadStartPhase` return; `awaitHosterOutcome:200` forwarding; `evaluateJDAfterGrace` gains a probes param; `jdRemove` gains a status-summary param + the new `warn` emit; `hosterOutcome` gains `exit`/`observed`; 13 terminal returns stamped. 282 raw lines today — watch the 400/500 gate. |
| `internal/download/service_pipeline.go` | **Modified** | `enqueueWithFallback` returns a struct; call site `:181` unpacks it; `download.episode_downloaded` `:192` and `download.failed` `:183` widen; `download.hoster_attempt` added to the switch. 395 raw lines today. |
| `internal/download/service_effects.go` | **Untouched** | `logf` already accepts `map[string]any`. |
| `internal/events/event.go` | **Untouched** | Deliberate — see §2.2. |
| `internal/observability/eventlog/**` | **Untouched** | Metadata surfaces in the MCP with zero MCP changes: `scanEventRow` already unmarshals `metadata_json` into `EventRecord`. |
| `internal/download/service.go` | **Untouched** | `animeRunOutcome` is not widened (§2.3). 541 raw lines — the largest file in the package. |
| `internal/download/service_notification_rows.go` | **Untouched** | The SDD-60 seam. Zero references to `hosterOutcome` or `enqueueWithFallback`. |
| `internal/download/service_cancel_test.go`, `service_fallback_test.go` | **Modified** | Broken by item 3's signature change (R-4). |
| `internal/download/service_hoster_watch_test.go` | **Modified** | Four tests assert on the discarded `*hosterOutcome` — repaired in place, nothing appended (frozen, see below). |
| new `internal/download/service_hoster_watch_observability_test.go` | **New** | All new tests. Plus a `logger.Fields`-capturing recorder and an advancing clock (R-6). |
| `openspec/specs/download/observability.md`, `sites.md` | **Modified** | Via delta specs at archive time. |
| `docs/learning-log.md` | **Appended** | Via `node scripts/log-lesson.mjs`, never by hand (CLAUDE.md #17). |

### 6.1 File-size freeze table (measured)

Go files warn at 400 effective lines and hard-fail above 500; `tools/checkgofilesize/baseline.yaml` stays `files: []`.

**FROZEN — do NOT append tests here:**

| File | Effective lines | Headroom |
|---|---|---|
| `app_download_test.go` | 497 | ~3 |
| `internal/download/service_hoster_watch_test.go` | 422 | ~78 — the natural TDD home, effectively frozen |
| `internal/download/service_run_status_test.go` | 405 | ~95 |

**CAN ABSORB** (raw counts; effective is materially lower — `countEffectiveLines` excludes comments and blanks, and both files are comment-heavy):

| File | Raw lines | Role |
|---|---|---|
| `internal/download/service_hoster_watch.go` | 282 | primary production target |
| `internal/download/service_pipeline.go` | 395 | secondary production target |

**Untouched** per the persistence finding: `internal/events/event.go`, `internal/observability/eventlog/sink.go`, `eventlog/sink_test.go`.

---

## 7. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `service_hoster_watch_test.go` is at 422 effective lines (~78 headroom, already past the 400 warning) and is the natural TDD home. | High | Low | New tests go in `service_hoster_watch_observability_test.go`. Full freeze table in §6.1. `tools/checkgofilesize/baseline.yaml` stays `files: []`. |
| R-2 | **The 4 KB metadata bound is ALL-OR-NOTHING** (`eventlog/types.go:22`, `metadata.go:33`): over the bound the store replaces the **entire** object with `{"_truncated":true,"_original_keys":N}` — an oversized JD snapshot destroys the probes array sitting beside it in the same map. | Medium | High | `download.jd_removed` carries **counts and booleans only, no arrays**. `probes` is bounded at 3 by construction. A test asserts the serialized map stays under the bound. |
| R-3 | Metadata is not filterable — `EventFilters` has no metadata dimension and `Text` expands only to `(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)`. | High | Medium | Any discriminator a reader must query on lives in `event_type` or in the message text. `stage` and `exit` are written into **both** metadata and the message. |
| R-4 | Item 3's signature change breaks `service_cancel_test.go` and `service_fallback_test.go`, and carries most of the diff. | High | Medium | Pre-declared cut line — see §8. |
| R-5 | Retention: ~2 extra rows per hoster attempt per episode, ~15–30 per run against the shared 20 000-row cap (`defaultRowCap`, pruned every 200 writes plus unconditionally on each process's first write). Estimated, not measured. | Medium | Low | New events are `info`/`warn`, never `debug` (debug is dropped by default). Verify measures actual rows for one run. |
| R-6 | `detectDownloadStartPhase` does not call `s.deps.Clock()`, and `baseDeps` wires a **fixed** clock — a naive probe-timestamp test records three identical `atMs` values and **passes vacuously**. | High | High | Use `newWatchTestService`, which advances time via `PollSleep`. This is precisely what the MUTATE step exists to catch: `ditto staged` after green. |
| R-7 | `observed` gets "helpfully" wired into a branch, silently turning this instrumentation change into the D1 behavior fix. | Medium | High | Spec requirement + a test that fails if any control-flow branch reads `observed`. Named explicitly in §2.2. |
| R-8 | **Framing flag.** The §8 cut line optimizes for diff size, not for the question the change exists to answer. `exit` (item 3) is the *only* field that answers "observed or inferred". | — | — | If slicing happens, the first slice's report MUST state plainly that the central question stays unanswered until slice 2 merges. Do not let a green slice-1 verify read as "the observability gap is closed". |
| R-9 | A `warn` on **every** `jdRemove` raises warn-level volume on the normal fallback path. | Medium | Low | Accepted deliberately: a destructive removal that logs nothing is the exact hole this change exists to close. `warn` (not `info`) because the row survives any future `PersistDebug`-style narrowing. |
| R-10 | Apply hangs `winningHoster`/`exit` on `animeRunOutcome` because it is already threaded to the emit site — silently widening the `animeProgressDelta` alias (19 uses in `service_pipeline.go`) and colliding head-on with SDD-60's 45 pending tasks through `service_notification_rows.go`. | **Medium** | **High** | §2.3 states the rule; §6.1 marks `service.go` untouched; a success criterion pins it. The result struct dies inside `processAvailableEpisode`. |

---

## 8. Changed-line forecast

| Item | Production | Test | Total |
|---|---|---|---|
| 1 + 1b — probes, both paths | ~40 | ~90 | ~130 |
| 2 — `download.jd_removed` | ~50 | ~70 | ~120 |
| 4 — `download.hoster_attempt` | ~15 | ~50 | ~65 |
| **Subtotal (items 1, 1b, 2, 4)** | **~105** | **~210** | **~315** |
| 3 — `exit`/`baseline`/`observed` + struct return (incl. R-4 test repair) | ~80 | ~150 | ~230 |
| **Total** | **~185** | **~360** | **~545** |

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
```

`delivery_strategy` is cached as **`single-pr`**, so the full ~545 lines land in one PR unless the orchestrator resolves otherwise. **Scope stays at all four items** — cutting item 3 would ship the change without the one field the change exists to produce (R-8). The pre-declared fault line, if slicing is chosen: **slice 1 = items 1, 1b, 2, 4 (~315, under budget, zero signature changes); slice 2 = item 3 (~230)**. `sdd-tasks` owns the final forecast.

---

## 9. Rollback plan

`git revert` the change commit. That is the whole plan, and it is that cheap for four structural reasons:

- **No schema change.** `runtime_events` and `metadata_json` are unchanged; new keys are just absent from older rows, and `EventRecord` unmarshals a partial map without error.
- **No wire contract.** No REST route, no WS message, no bus-event field. `docs/openapi.yaml` and the mobile sync contract are untouched — `sdd-verify` must confirm this and report it as a positive finding, not an omission (CLAUDE.md, `feedback_api_consumers_doc_updates`).
- **No behavior.** Every verdict, branch and outcome is byte-identical before and after. Reverting cannot change a download result, because the change never could.
- **Residue is inert.** Rows already written keep their extra metadata keys and remain readable; they age out through the existing 20 000-row prune. Nothing reads them programmatically.

**Partial rollback** without reverting the whole change: item 3 is the only item with a signature change, so it is the only one whose revert touches another file. Items 1, 1b, 2 and 4 are each a self-contained `logf` and can be reverted individually.

---

## 10. Dependencies

None. No new Go module, no new npm package, no new infrastructure. Everything rides `logf` → `FanoutLogger` → `eventlog.Sink`, which already exists and is already load-bearing.

---

## 11. Success criteria

- [ ] Every `jdRemove` — including a **successful** one — persists a `download.jd_removed` row carrying the JD status it observed, or `statusKnown:false` when it observed none.
- [ ] `download.detect_start_succeeded` persists a probes array; `download.episode_downloading`'s "zero persisted rows, ever" is no longer true.
- [ ] `download.detect_start_failed` carries the same probes array with three distinct `atMs` values — proven with an **advancing** clock, and the mutant that reverts to the fixed clock is killed by `ditto staged` (R-6).
- [ ] `download.episode_downloaded` and the episode-level `download.failed` carry `exit`, `hoster`, `attemptIndex`, `baseline` and `observed`; `exit` distinguishes all 17 terminal points, including the three fallback-timeout mirrors and the split at `:221`.
- [ ] Every hoster attempt — success included — persists exactly one `download.hoster_attempt` row.
- [ ] A test proves **no control-flow branch reads `observed`** (R-7).
- [ ] `animeRunOutcome` has **exactly the fields it has today** — `internal/download/service.go` and `service_notification_rows.go` show a zero-line diff (§2.3, R-10), keeping SDD-61 disjoint from SDD-60.
- [ ] No new test is appended to `app_download_test.go`, `service_hoster_watch_test.go` or `service_run_status_test.go` (§6.1).
- [ ] A test proves each new metadata map serializes under the 4 KB bound, so `_truncated` never replaces a probes array (R-2).
- [ ] Replaying the `run-dl1532pqkk3g` scenario against the instrumented code answers "was Mediafire's success observed or inferred, and was its removal justified" **from `runtime_events` alone** — no JD log, no NTFS timestamps, no arithmetic over event spacing.
- [ ] `internal/events/event.go`, `download/orchestration.md`, `docs/openapi.yaml` and the mobile sync contract are untouched, confirmed by `sdd-verify`.
- [ ] `go run ./tools/checkgofilesize` passes with `baseline.yaml` still `files: []`, and the full pre-commit gate is green (budget ≥ 300 000 ms for `git commit`).

---

## 12. Proposal question round

`execution_mode=auto` and CLAUDE.md project note #1 require this workflow to run without pausing, so the decisions below were made from evidence rather than asked. These are the product-level assumptions worth correcting if any is wrong — flagged here rather than buried.

1. **A `warn` on every `jdRemove`, including successful removals (R-9).** Assumption: a destructive removal is always worth a warn-level row, even on the ordinary fallback path, because the case this change exists to prevent was a *successful* removal that logged nothing. Correction path: make the non-destructive case `info` and reserve `warn` for removals where `anyFinished:true`.
2. **`observed` is recorded and never acted on (R-7).** Assumption: shipping the evidence for D1 without the fix is better than shipping neither, because the fix is unverifiable without the evidence. Correction path: fold D1 into this change and accept a behavior change with no baseline to compare against.
3. **`duration_ms` stays out.** Assumption: attempt duration does not currently drive a specific decision that `exit` plus the probe timeline does not already answer. Correction path: add it — `LogEntry.DurationMs` is a first-class column, so it is purely additive later.
4. **Scope stays at four items despite ~545 forecast lines (§8, R-8).** Assumption: `exit` is the field the change exists for, so cutting item 3 to fit the budget would ship an observability change that cannot answer its own central question. Correction path: resolve `delivery_strategy` to chained slices at the §8 fault line.
5. **`exit` is one closed enum of 17 values, not two keys (§5.1).** Assumption: "which terminal point produced this outcome" is one question, whether the answer came from `awaitHosterOutcome` or from `enqueueWithFallback`'s pre-attempt guards. Correction path: split into `exit` + `pipelineExit` if readers turn out to filter them separately.
