# Explore — SDD-61 Download Attempt Observability

**Scope: instrumentation only.** This change records what the download orchestrator already
knows. It does NOT alter D1/D2/D3 behavior; a follow-up change does that.

## Why this change exists

Download run `run-dl1532pqkk3g` (2026-08-28) reported "3 episode(s) downloaded" through a broken
path, and the persisted event log could not show it. Forensics against JDownloader's own
`DownloadWatchDog` log established what bridge's own record could not:

- JD ran **five** downloads; bridge's persisted stream describes three.
- Mediafire finished all three episodes. Bridge classified it `dead` twice, deleted its two
  FINISHED packages via `jdRemove` → `RemoveByDestination`, and credited the files to a mega.nz
  fallback that transferred zero bytes.
- The run's persisted timeline holds 15 events and **not one records those two destructive
  removals**.

The reconstruction that closed the case needed three external records (JD's log, NTFS
`CreationTime`, arithmetic over event spacing). None of it was available from bridge. The
instrumentation below exists so the next investigation needs only bridge.

## Current state

### The two fan-outs — only one is persisted

| Path | Route | Persisted | Read by |
|---|---|---|---|
| `s.logf(...)` | `service_effects.go:114` → `logger.Logf` → `FanoutLogger.write` (`logger/fanout.go:66`) → every `EntrySink` incl. `eventlog.Sink.WriteEntry` → `Queue.TryEnqueue` → `SQLiteStore.InsertEvent` → `runtime_events` | **yes** | `autoreas-request-mcp` |
| `s.publish(...)` | `service_effects.go:59` → `events.Bus.Publish` → live subscribers | **no** | Wails frontend, realtime hub |

No bus subscriber writes into `runtime_events`. Subscriptions are `app_runtime_services.go:174`,
`app_season_availability.go:202`, `app_startup_runtime.go:359` and `app_startup_runtime.go:386`.

**`download.run_progress` resolved (verified).** It reaches the persisted log from exactly one
place: `service_effects.go:48`, the **failure** branch of `recordProgress`. The success branch
(line 52) calls `s.publish`, which never reaches SQLite. The 3 rows across 49 runs are 3
`UpdateRunProgress` failures, not progress ticks. The asymmetry is by design, not a defect.

**Consequence:** every new field MUST go into a `logf` metadata map. `internal/events/event.go`
must not be touched — a field added there reaches the UI and mobile and leaves the forensic log
unchanged.

### Metadata pipeline and its limits

`logf`'s `map[string]any` → `logger.Fields.Metadata` → `LogEntry.Metadata` →
`Sink.toEventRecord` (`eventlog/sink.go:153`) → `boundMetadataJSON` (`eventlog/metadata.go:24`) →
`runtime_events.metadata_json`.

1. **The 4 KB bound is all-or-nothing** (`eventlog/types.go:22`, `metadata.go:33`). Over the bound
   the store replaces the **entire** object with `{"_truncated":true,"_original_keys":N}`. It does
   not truncate a field — an oversized JD snapshot destroys the probes array sitting beside it in
   the same map.
2. **Debug is dropped by default** (`sink.go:144`, `SinkConfig.PersistDebug` off). New events must
   be `info` or `warn`.
3. **Redaction** (`metadata.go:52`) is a recursive substring match over
   `authorization/token/cookie/password/secret/api_key/bearer`. No collision with planned keys.
4. **Metadata surfaces in the MCP with zero MCP changes** — `scanEventRow` (`eventlog/reader.go:104`)
   unmarshals `metadata_json` into `EventRecord`, which is the payload of `search_events` and
   `get_correlation_timeline`. **It is not filterable**: `EventFilters` (`eventlog/filters.go:9`)
   has no metadata dimension and `Text` expands only to
   `(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)`.
5. **Retention**: `defaultRowCap` 20000, pruned every 200 writes plus unconditionally on the first
   write of each process (`eventlog/store.go:60`), shared across all domains.

### Where the data dies

**1. `hosterOutcome{kind}` collapses nine terminal points into three enum values**
(`service_hoster_watch.go:79`):

| Line | Exit | Kind | Side effect |
|---|---|---|---|
| 186 | nil Counter | timeout | none |
| 191 | entry guard, disk already ahead | success | `flattenDownloadFolder` only — **no rename** |
| 196 | JD pre-check dead | dead | `jdRemove` (inside `jdPreCheckIsDead`) |
| 213 | FASE 2 filesystem poll | success | `completeDownloadedEpisode` (rename + flatten) |
| 221 | FASE 2 deadline | timeout | none |
| 238 | post-grace, JD nil, first hoster | dead | none |
| 249 | post-grace query error, first hoster | dead | `jdRemove` |
| 256 | post-grace classified dead | dead | `jdRemove` |
| 266 | post-grace no positive signal, first hoster | dead | `jdRemove` |

**2. `enqueueWithFallback` returns `(bool, string)`** (`service_pipeline.go:322`); on success
`return true, ""` (line 353). The winning hoster, its index and the exit never reach the publish
site at `service_pipeline.go:192-193`.

**3. `detectDownloadStartPhase` returns `(bool, *hosterOutcome)`** whose second value is discarded
at its only production call site (`service_hoster_watch.go:200`, `started, _ :=`). Four tests
assert on it.

## Corrections to the briefing

- **C1 — three probes, not four.** `detectDownloadStartPhase` runs `PollSleep(20s)` then
  `for i := range 3`, sleeping only while `i < 2`. Checks land at t=20/40/60s with 20 s gaps.
  This strengthens D3 rather than weakening it.
- **C2 — `DestinationStatus` carries no identity.** It is
  `{Matched, CrawlOnlineCount, CrawlOfflineCount, PackageSignals[], Links[]}`
  (`jdownloader/client.go:46`). The neutral port strips names, files, URLs and `SaveTo`
  (`status.go:73`). The limitation is not merely that `RemoveByDestination` returns only `error`
  — the identity of a removed package is unavailable anywhere at that layer.
- **C3 — adding fields to `DownloadEpisodeDownloadedEvent` is the wrong lever.** Bus events are
  not persisted.
- **C4 — the publish/logf asymmetry is by design.** Not a persistence bug to fix here.
- **C5 — `exit` is more load-bearing than first described.** Exit 191 skips
  `completeDownloadedEpisode`, so the file is never renamed; exit 213 renames. `exit` therefore
  also answers "was this file given a parseable name", which feeds `downloadedEpisodeBaseline`.
- **C6 — the size risk is in the test file, not production.** `service_hoster_watch_test.go` is at
  422 effective lines (~78 headroom, already past the 400 warning). Production raw counts:
  `service_hoster_watch.go` 282, `service_pipeline.go` 395, `service_effects.go` 124.
  `countEffectiveLines` (`tools/checkgofilesize/main.go:283`) excludes comments and blanks, so
  effective counts are materially lower than raw.

## Recommended approach — hybrid, not wholesale widening

**Item 4 — per-attempt hoster/outcome. Zero plumbing.** `enqueueWithFallback`'s switch
(`service_pipeline.go:351-364`) already holds `i`, `hl.hoster` and `outcome.kind`, and already
logs the dead and timeout branches but **not** success. Add one `download.hoster_attempt` entry
covering all three.

**Item 1 — probes. Local.** Emitted from `detectDownloadStartPhase`: return `[]probe{at, found}`
in place of the discarded `*hosterOutcome`; `evaluateJDAfterGrace` attaches it to the existing
`download.detect_start_failed` (line 232). One event per attempt, not one per probe.

**Item 2 — JD status before `jdRemove`. Local.** Emitted at the `jdRemove` call sites (146, 248,
255, 265 — three hold a status; 248 has none by construction). Pass a nil-able summary into
`jdRemove` and log a new `warn` `download.jd_removed` on **every** removal. Today a successful
destructive removal logs nothing at all.

**Item 3 — exit/baseline/observed on `download.episode_downloaded`. The only widening.**
`hosterOutcome` gains `exit` and the `observed` count; `enqueueWithFallback` returns a small
struct `{succeeded, failureKind, hoster, attemptIndex, exit, baseline, observed}`. This also
improves the existing `download.failed` emit at `service_pipeline.go:183`.

**Rejected:** a mutable accumulator threaded by pointer — it adds a second control-flow channel,
contradicts package style, and buys nothing once items 1, 2 and 4 are local.

**Scope addition recommended:** persist the *successful* detect path too.
`detectDownloadStartPhase:118` only publishes ephemerally, so `download.episode_downloading` has
**zero persisted rows, ever**. One `logf` carrying the same probes array yields the near-miss
distribution needed to size the eventual D3 fix.

`duration_ms` stays excluded. Note that `LogEntry.DurationMs` is already a first-class column
(`eventlog/store.go:43`, `nullableDuration`), so adding it later is additive.

## Specs

Extend `openspec/specs/download/observability.md`. The per-attempt hoster/outcome requirement
extends `download/sites.md` "Failure-Cause Classification Is Telemetered", which already mandates
`Metadata.failureKind`. **Do not touch `download/orchestration.md`** — that is behavior, and
behavior is out of scope. SDD-20 (`observability-v2`) conventions — additive `Fields`/`Logf`,
`omitempty` — are compatible.

## Risks

- **R1** `service_hoster_watch_test.go` is at 422 effective lines (~78 headroom). New tests need
  their own file. `tools/checkgofilesize/baseline.yaml` stays `files: []`.
- **R2** The 4 KB metadata bound is all-or-nothing. Cap serialized `Links`/`PackageSignals`
  arrays and record totals separately.
- **R3** Metadata is not filterable. Any discriminator a reader must query on has to live in
  `event_type` or in the message text.
- **R4** Changing `enqueueWithFallback`'s signature breaks `service_cancel_test.go` and
  `service_fallback_test.go`. Item 3 carries most of the diff and is the natural second slice if
  the 400-line budget binds.
- **R5** Retention: roughly 2 extra rows per hoster attempt per episode, ~15–30 per run against a
  20000-row shared cap. Estimated, not measured.
- **R6** `detectDownloadStartPhase` does not call `s.deps.Clock()`, and `baseDeps` wires a
  **fixed** clock — so a naive probe-timestamp test records three identical `at` values and
  passes vacuously. Use `newWatchTestService`, which advances time via `PollSleep`. This is
  precisely what the MUTATE step exists to catch.
- **R7** Item 3's `observed` disk count is one `downloadedEpisodeBaseline` call away from being
  the D1 fix. The spec MUST state that it is recorded and never acted on.

## Test infrastructure needed

`baseDeps` (`service_test_builders_test.go:54`) wires `sharedlogger.NewFanoutLogger()` — a null
logger — plus a fixed clock. This change needs a recorder capturing full `logger.Fields` (the
existing `renameEventRecorder`, `service_rename_test.go:70`, keeps only `EventType`) and an
advancing clock.

## File-size freeze table (measured)

`countEffectiveLines` (`tools/checkgofilesize/main.go:283`) excludes comments and blanks, so
effective counts run materially below raw ones. Warn at 400, hard fail above 500.

**Frozen — do not append:**

| File | Effective | Note |
|---|---|---|
| `app_download_test.go` | 497 | ~3 lines headroom. Untouchable. |
| `internal/download/service_hoster_watch_test.go` | 422 | The natural TDD home, and effectively frozen. New tests MUST go in `service_hoster_watch_observability_test.go`. |
| `internal/download/service_run_status_test.go` | 405 | Past warn; not a target anyway. |
| `internal/download/service.go` | 541 raw | Holds `animeRunOutcome:196`. Avoid — see the rule below. |

**Can absorb changes** (raw counts; both files are comment-heavy):

- `internal/download/service_hoster_watch.go` — 282 raw. Primary production target.
- `internal/download/service_pipeline.go` — 395 raw. Secondary production target.

`internal/events/event.go` (231), `eventlog/sink.go` (193) and `eventlog/sink_test.go` (484 raw)
are untouched by this change, per the persistence finding above.

## Hard rule: do not widen `animeRunOutcome`

**SDD-61 MUST NOT add fields to `animeRunOutcome`** (`internal/download/service.go:196`).

Four independent reasons, all verified against source, strongest first:

0. **Structural — the struct is aliased.** `internal/download/service.go:228` declares
   `type animeProgressDelta = animeRunOutcome`. That is a type **alias** (`=`), not a defined
   type: the two names are the same type, with 24 non-test `animeProgressDelta` references across
   `service.go`, `service_pipeline.go` and `service_single_anime.go`. Widening `animeRunOutcome`
   therefore silently widens the **live progress-delta channel** threaded through `emitProgress`
   into the UI fan-out, so a forensic per-attempt field would leak into user-facing progress
   payloads. This blast radius is invisible from the struct's name — which is why the design must
   make the constraint structural rather than documented.

`service_notification_rows.go` references `animeRunOutcome` 13 times and neither `hosterOutcome`
nor `enqueueWithFallback` even once. The remaining three reasons:

1. **Design.** `animeRunOutcome` exists to build user-facing notification rows — its own field
   comments say so ("so a notification row can say 'Episodes 14-16' instead of only
   '3 episodes'"). Per-attempt forensic data serves a different audience. If apply feels pressure
   to hang `winningHoster` or `exit` there, the signal is that the emit site is wrong, not that
   the struct needs widening.
2. **Collision avoidance.** SDD-60 (notification-center) is in flight with 45 pending tasks and
   owns `service_notification_rows.go`. SDD-61 and SDD-60 stay disjoint exactly as long as that
   struct is not widened.
3. **Size.** `service.go` is 541 raw lines — the largest file in the package.

The recommended shape already respects this: `enqueueWithFallback`'s result struct is consumed
**locally** in `processAvailableEpisode` to build the `logf` metadata map, and is never stored on
the outcome.

## Recorded spec gap (CLAUDE.md #2)

`openspec/changes/2026-07-17-sdd-51-download-failure-hoster-fallback/specs/download-orchestration/spec.md`,
requirement "Filesystem Is Success Truth, JD Status Is Failure Truth", covers only "JD reports
finished-ok but the file has NOT landed". It is silent on "finished-ok **and** the file HAS
landed", and `evaluateJDAfterGrace` resolves that silence by declaring a completed download dead.
The code complies with the letter and contradicts the intent. **Code wins as runtime truth**; the
gap is recorded here so the follow-up behavior change adds the missing scenario rather than
silently reinterpreting the existing requirement.
