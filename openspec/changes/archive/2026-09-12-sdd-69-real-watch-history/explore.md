# Exploration: Real Watch History (SDD-69)

**Date**: 2026-09-12
**Status**: complete
**Method**: CodeGraph structural queries + direct measurement against the live
`%APPDATA%/Autoreas/data/bridge.db` (22.2 MB). Every number below is measured, not estimated.

## 1. The request

> "Currently only the last change per anime is stored. That worked for seeing the last watched
> episode, but it is useless as long-term history. Anime detail should hold that anime's history;
> the global history lives outside it. The global history will be its own table and can be
> infinite — consider performance and storage long-term."

Refined across the session into a browser-history model: one row per episode watched, with its own
timestamp, newest first, grouped by day.

## 2. What exists today

### 2.1 `/history` is a snapshot projection, not a log

`QueryService.ListAnimeHistory` (`internal/anime/service.go:141`) walks the current snapshot set and
emits one `contracts.AnimeHistoryItem` per anime, filtered on a present `LastWatchedAt` and sorted
DESC by it. There is no time dimension and no event rows. The frontend
(`frontend/src/features/history/ui/HistoryTable/use-history-table.ts:44`) fetches the whole list in a
single `getAnimeHistory()` call and filters/sorts/pages client-side.

**So the premise "only the last change is stored" is accurate for this screen, but it is not a
truncated log — there was never a log behind it.**

### 2.2 `activity_log` IS an append-only event log, and it is write-only

`internal/activity/schema.go` defines:

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, action_type TEXT NOT NULL,
  anime_id TEXT NOT NULL, anime_name TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL, correlation_id TEXT,
  before_json TEXT, after_json TEXT
)
```

with four indexes: `(occurred_at_ms DESC, id DESC)`, `(anime_id, occurred_at_ms DESC)`,
`(action_type, occurred_at_ms DESC)`, `(correlation_id)`.

Both write paths are wired and confirmed by the data: desktop through `EpisodeService`
(`internal/anime/episode_service.go:267`, `episode_service_repeat_restore.go:35,83`,
`episode_service_schedule_state.go:73,126`), mobile through `activityAnimeWriteService`
(`internal/desktop/app_activity_write.go:20`), wired into `startHTTPServer` at
`app_runtime_services.go:37`.

**`Store.ListRecent` (`internal/activity/store.go:111`) has ZERO production callers** — verified by
grep; every caller is a test. No Wails binding, no HTTP route, no UI. The table is write-only.

### 2.3 `SetAnimeDays` deliberately records nothing

`internal/anime/episode_service_schedule_state.go:89` — "rewrites dias[] without recording a
watch-state activity entry". Intentional and documented. Scheduling is not watch history.

## 3. Measurements

### 3.1 Volume and footprint

| Metric | Measured value |
| --- | --- |
| Rows in `activity_log` | 671 |
| Span | 2026-07-05 → 2026-09-11 (69.2 days) |
| Write rate | 9.7 rows/day |
| Footprint (dbstat, table + all 4 indexes) | 278,528 B = **415 B/row** |
| — table pages | 155,648 B |
| — index pages | 122,880 B (largest: `idx_activity_log_correlation`, 45,056 B) |
| Distinct animes with activity | 39 of 839 |

Projection at the measured rate: 1.4 MB/year, ~14 MB after 10 years, against a `bridge.db` that
already weighs 22.2 MB. **Storage is not the constraint.** `activity_log` is nevertheless the only
bridge table with no retention policy (syncdiag caps at 5,000, notification center at 2,000,
eventlog at 20,000, each via `pruneOldestBeyondRetention`).

### 3.2 Composition — 41% is not history

| action_type | Rows | Changed status | Changed progress | Note |
| --- | ---: | ---: | ---: | --- |
| `episode_adjusted` | 318 | 18 | 308 | **10 adjusted no episode** |
| `anime_folder_opened` | 171 | 0 | 0 | telemetry, `before == after` |
| `anime_page_opened` | 74 | 0 | 0 | telemetry |
| `chapter_adjusted` | 61 | 0 | 61 | legacy name, consistent |
| `anime_folder_copied` | 16 | 0 | 0 | telemetry |
| `anime_page_copied` | 16 | 0 | 0 | telemetry |
| `anime_state_set` | 10 | 7 | 0 | **3 changed nothing** |
| `anime_restored` | 3 | 0 | 0 | changes `Activo`, consistent |
| `anime_repeated` | 2 | 2 | 2 | consistent |
| `anime_soft_deleted` | 0 | — | — | never observed |

Navigation telemetry = 277 rows = **41.3%** of the log, with identical before/after and no reader.

### 3.3 DEFECT — `action_type` is wrong on 21 rows

`activityPatchOutcome` (`internal/desktop/app_activity_write.go:44-64`) uses **sequential `if`
statements, not `else if`**, and each overwrites `actionType`. Effective precedence:
`RepeatAt > Activo > NroCapVisto > Estado`. Mobile sends `Estado` and `NroCapVisto` in one patch, so
the row is labelled `episode_adjusted` while the real change was the status.

Evidence: 10 `episode_adjusted` rows changed no progress (all `source = mobile`, all showing an
`Estado` transition with `NroCapVisto` unchanged); 8 more changed both; 3 of 10 `anime_state_set`
rows changed nothing at all (`0 -> 0`).

**Consequence for this change: the history must derive its facts from the before/after diff, never
from `action_type`.** That is the correct design regardless of the defect — the label describes the
intent of a write, history describes the fact of a change.

### 3.4 Progress delta distribution (379 rows)

| Delta | Rows |
| ---: | ---: |
| +1.0 | 283 |
| −1.0 | 63 |
| −2.0 | 11 |
| +0.5 | 6 |
| −0.5 | 6 |
| 0.0 | 10 (the mislabelled status rows) |

- **The maximum forward step is +1.0.** No multi-episode jump exists in 69 days, so one log row is
  always exactly one episode. No expansion or jump-interpretation is needed.
- 80 of 379 (21%) are rollbacks.
- `NroCapVisto` is a `float64` and half-steps are real (6 rows). Dr. Stone oscillates
  `11 → 10.5 → 11 → 10.5 → 11 → 10.5` across six consecutive rows.
- Caveat for anyone re-running this: SQLite's `%` casts to integer, so
  `CAST(x AS REAL) % 1 != 0` does NOT detect fractional values. Use
  `CAST(x AS REAL) != CAST(CAST(x AS REAL) AS INTEGER)`.

### 3.5 Rollback timing — decides the model

| Gap from the previous event on the same anime | Rollbacks |
| --- | ---: |
| under 1 min | 34 |
| under 1 hour | 35 |
| under 24 h | 7 |
| over 24 h | **2** |

**89% of rollbacks resolve within an hour; 98% within the same day.** Only 2 in 69 days are genuine
cross-day retractions.

### 3.6 Burst behaviour

Binges are real: One Pace — Whole Cake Island logged 18 events in one hour; Tengen Toppa Gurren
Lagann 12; Date a Live 7 within 3 seconds. Per local day (UTC−3), the worst noise ratios are:

| Anime, one day | Raw log rows | Rollbacks | Net episodes |
| --- | ---: | ---: | ---: |
| One Pace — Whole Cake Island | 33 | 10 | +3 |
| Tengen Toppa Gurren Lagann | 28 | 13 | +2 |
| Bleach — Kashin-tan | 12 | 5 | +2 |
| Dr. Stone — Science Future P3 | 6 | 3 | **0** |
| Tensei shitara Slime 4th | 6 | 3 | **0** |

## 4. Model selection — and two rejected alternatives

The browser-history analogy settles the shape. A browser logs *you visited this page, at this time*,
not *the URL bar changed from A to B*. Verified against a real browser history: three visits to the
same video one second apart each keep their own row and timestamp; repetition is surfaced as a
**count in a column beside the row**, never as a collapse of the timeline.

**Rejected — one entry per log row.** Measured, that is 28 rows to record 2 episodes on the worst
day: a 14-to-1 noise ratio, the same category error as the telemetry.

**Rejected — fold each day into a digest** ("watched episodes 37–39", one entry). Fixes the noise by
destroying what a history is for: ask *what was the last thing I watched before bed* and a digest
cannot answer, because it holds one timestamp for three episodes.

**Selected — one row per episode watched, with its own timestamp; a rollback DELETES the row.** A
rollback is a retraction ("I did not watch episode 9"), and the correct response is to remove the
entry, exactly as a browser lets you delete a mistaken visit — not to add a second row announcing
the mistake. The Dr. Stone oscillation then leaves nothing behind, because nothing was watched, with
no digesting involved.

### 4.1 Replay verification — AND ITS TWO FLAWS (corrected 2026-09-12)

A replay of 379 progress events in timestamp order (forward step inserts, backward step deletes the
episodes above the new value) reported:

```
events replayed      379
  forward inserts    289  (0 re-inserted an episode already held)
  rows deleted       88   (3 rollbacks matched nothing)
  zero-delta skipped 10
surviving rows       201   across 36 animes
```

**Do not carry these numbers into the design or the tasks. The replay was measured on a filtered
subset and two of its conclusions are artifacts of that filter.** Both flaws were found by `sdd-design`
and confirmed against the live database.

**Flaw 1 — the replay filtered by `action_type`, the exact field this design says never to trust.**
Its query was `WHERE action_type IN ('episode_adjusted','chapter_adjusted')`, which silently excluded
`anime_repeated`. But a repeat **is** a progress change: both write paths stamp
`After.NroCapVisto = 0` (`internal/anime/episode_service_repeat_restore.go:95-99`, and
`internal/desktop/app_activity_write.go:60-62` for the mobile path). The real rows are:

| Anime | Diff | When |
| --- | --- | --- |
| Date a Live II | `11 → 0` | 2026-08-30 |
| Date a Live | `13 → 0` | 2026-08-22 |

Fed to a naive diff-derived backward rule, `11 → 0` means "retract every episode above 0" and
**deletes that anime's entire history**. A cycle reset is not a retraction: the episodes were still
watched. `sdd-design` D3 fixes this with `CycleReset → EffectNone` plus a `cycle` column, retraction
scoped to `(anime_id, cycle)`.

**Flaw 2 — "zero double inserts" is an artifact of the log's start date, not a property of the
model.** Date a Live II's full sequence in the log *begins* with the repeat and then climbs
`0 → 1 → … → 11` through September. Its pre-repeat episodes predate the log entirely, so no episode
number was ever reached twice **within the sample**. Had the earlier cycle been recorded, episodes
1-11 would each appear twice and a unique index on `(anime_id, episode)` would have collided.

The replay's Map-based store also overwrote on collision rather than erroring, so it could not have
surfaced a duplicate as a failure even where one existed.

Therefore the `cycle` column is **required for correctness, not defensive**: without it the second
watch of an episode either violates uniqueness or silently overwrites the first watch's timestamp,
losing the fact that it was watched in both cycles.

**What survives from the replay**: the shape of the insert/delete model, the 3 unmatched
below-the-floor retractions, and the finding that the log's coverage begins 2026-07-05. **The 201-row
count does not survive** — the post-fix count is higher and MUST be re-measured during apply against
the corrected rules. No estimate is recorded here on purpose.

**General lesson**: a measurement that pre-filters its input by the field under suspicion cannot
detect the cases that field mislabels.

The newest rows render directly:

```
2026-09-11 22:03 | ep 11 | Date a Live II
2026-09-11 19:23 | ep 20 | Honzuki no Gekokujou: ... Ryoushu no Youjo
2026-09-11 19:23 | ep  9 | Kimi ga Shinu made Koi wo Shitai
2026-09-11 19:23 | ep  9 | Tefuda ga Oume no Victoria
2026-09-10 12:14 | ep 15 | Re:Zero kara Hajimeru Isekai Seikatsu 4th Season
2026-09-10 12:14 | ep 13 | One Pace - Wano
```

**This materialises the history, which is required, not optional**: a folded/derived model cannot be
keyset-paged, because deciding whether row N is visible needs lookahead to a later retraction. A
materialised table makes global paging a plain index scan.

## 5. Telemetry destination — verified, not assumed

`runtime_events` (`internal/observability/eventlog`) is the correct home and, unlike `activity_log`,
it is genuinely used:

- **6,280 rows** across 10 domains (websocket 1992, sync 1570, tracer-bullet 791, download 694,
  api 478, system 372, anime 371, device 5, bus 4, schedule 3).
- Full query engine: `reader.go`, `reader_search.go`, `reader_summary.go`, `reader_correlation.go`.
- Wails bindings in `internal/desktop/app_runtime_events.go`; UI in
  `frontend/src/features/network/ui/NetworkPanel/`; and an MCP sidecar reads it from a separate
  process (`internal/mcp/requestcapture/reader.go`).
- Three indexes: time, correlation, domain+level.
- **Already managed**: `defaultRowCap = 20000`, `defaultPruneEvery = 200`
  (`internal/observability/eventlog/types.go:17-18`), plus an unconditional prune on the first write
  of each process. Measured 6,280 rows over 44 days = **142.7 rows/day**, so the cap makes it a
  rotating window of ~140 days.
- Writes go through `eventlog.NewQueue`, which **drops on overflow rather than blocking**.

Cost of moving navigation telemetry there: 277 rows over 69 days = **4.0 rows/day**, +2.8% on
142.7/day, moving the rotation from ~140 to ~136 days.

**Non-obvious benefit**: today `RecordActivity` runs synchronously inside the patch and its error
propagates (`activityAnimeWriteService.PatchAnime` returns the error), so a failed telemetry write
can fail the user's action. The eventlog queue removes that coupling.

**Watch out**: `runtime_events` already holds 371 rows at `domain = "anime"`, all with a null
`event_type` and none newer than 2026-08-30 — residue from the tracer-bullet defect that derived a
domain by splitting its own sentence on `": "` (`internal/tracerbullet/runner.go:10-19`, since fixed
with the `tracerDomain` constant). Confirm they are dead before writing real anime telemetry into
that domain.

## 6. Resulting architecture — three tables, three lifetimes

| Table | Holds | Lifetime | Read by |
| --- | --- | --- | --- |
| `watch_history` (new) | one row per episode watched | permanent | History screen, Anime Detail |
| `activity_log` | state diffs with source + correlation | capped, high | audit / conflict forensics |
| `runtime_events` | diagnostics incl. navigation telemetry | rotating ~140 days | NetworkPanel, MCP sidecar |

The asymmetry is the point: *you watched episode 9* is kept forever; *a folder was opened* is kept
until the question it answers goes stale.

## 7. Prior art in the codebase

- `AnimeRepetitionTimeline.tsx` already renders an anime's repetition history from the snapshot's
  `Repetitions` array — cycle boundaries. The new per-anime history is the movement *between* them,
  and belongs beside it.
- `internal/persistence` schema registry (sdd-34) is how `activity_log` registers its DDL; the new
  table registers the same way.
- `pruneOldestBeyondRetention` in syncdiag / notification center / eventlog is the retention pattern
  to copy, including the "prune unconditionally on the first write of each process" cadence.
- `useProgressiveListWindow` + ADR-012 govern any rail that can render 100+ rows.

## 8. Open risks

1. **Backfill is one-shot and destructive-adjacent.** It reads `activity_log` and deletes the 277
   telemetry rows. Repo restore points (`internal/sync/restore_point.go`) cover rollback.
2. **History begins where the log begins** (2026-07-05). An anime at episode 39 whose log starts at
   30 shows 30–39. Honest, and the only thing the data supports.
3. **The `action_type` defect must be fixed or explicitly bypassed** before any consumer trusts the
   label. This change bypasses it by deriving from the diff, and fixes it separately.
4. `/history`'s existing URL-state contract (`q`, `estado`, `tipo`, `sort`, `page`) is replaced; the
   spec must state what the new surface's URL state is.

## 9. Recommended next phase

`sdd-propose` — the evidence is complete and the model is selected. No `sdd-research` lane is
needed: every question this change raised was answerable from the codebase and the live database,
and no external source was consulted or required.
