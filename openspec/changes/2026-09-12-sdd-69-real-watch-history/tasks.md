# Tasks: Real Watch History (SDD-69)

Change: `2026-09-12-sdd-69-real-watch-history`
Inputs: `proposal.md`, `explore.md`, `design.md` (810 lines, D1-D9), `specs/watch-history/spec.md`
(18 requirements), `specs/anime-history/spec.md` (8 requirements), `specs/observability/spec.md`
(1 modified requirement). All four inputs are final and mutually reconciled — the three spec-wording
corrections design.md's "Spec reconciliation required" section calls for are already present in the
spec files read for this plan (the cycle-scoped unique index, the integer-episode-column wording, and
the partial-trailing-day-count wording all match the corrected text). No spec-editing task is owed.

## Task-Planning Notes (read before Slice 1)

**A. The old `GetAnimeHistory`/`ListAnimeHistory`/`AnimeHistoryItem` surface stays alive through
Slice 6, and is removed only in Slice 7 — this deviates from `design.md`'s "File Changes" table, which
bundles the removal into the same row as the new bindings.** `frontend/.../HistoryTable/use-history-table.ts`
calls `getAnimeHistory()` until `HistoryTable` itself is deleted in Slice 7; removing the Go binding or
the frontend adapter call any earlier breaks the still-rendered `/history` route. Slice 5 is therefore
**additive only** for the Go/TS binding surface: it adds `WatchHistoryPage`/`WatchHistoryEntry` and the
two page bindings beside the old ones, and Slice 7 removes `AnimeHistoryItem`, `ListAnimeHistory`,
`GetAnimeHistory`, and `getAnimeHistory()` in the same commit as the `HistoryTable` deletion, because
that commit is the first point at which all four have zero remaining callers.

**B. `R=3, K=0` is the FIRST cycle-alignment fixture, not an edge case.** Measured: 59 of 61 repeated
animes have more snapshot repetitions than logged resets (`design.md` D3). Write it before `K > R` or
`R=1, K=1`.

**C. `tools/checkarchitecture` is a raw substring scan over `.go`/`.ts`/`.tsx` source text, comments
included (D1).** Slice 1's new package must avoid the literal `activity_log` in its own prose (say "the
audit log"; the new column is `source_activity_id`, which does not trip the check on `activity` alone).
Once Slice 1 lands the second owned-table rule, no file outside `internal/watchhistory/` may contain the
literal `watch_history`, including in a comment — the backfill driver in `internal/sync/` uses
camelCase identifiers (`ensureWatchHistoryBackfill`) for exactly this reason.

**D. `useProgressiveListWindow` MUST NOT be imported anywhere in the new `/history` module, and
`Table.LoadMore`/`useLoadMoreSentinel` is forbidden (D5a, ADR-012's 2026-08-31 correction).** The rail
takes ADR-012's live branch: `onScroll` + `isNearListBottom` on the wrapping `overflow-y-auto` div,
never `Table.ScrollContainer`.

**E. Size exception, declared now rather than found at apply time.** Slice 7 measures **≈2,398** lines
(the 500-line "three states + windowing guard + route switch" unit plus the measured 1,858-line
`HistoryTable` deletion (899 production / 959 test) plus the small Go/TS removal from Note A), against
the 600-line budget. Reason: a replace-unit whose deletion half cannot be refactored down (there is
nothing to trim from a deletion) and whose split into "add" + "delete" commits would leave an
intermediate commit either shipping an unrendered component or breaking the still-live `HistoryTable`.
Per `AGENTS.md` → "Sizing a Change", this is reported and the chain continues — it is never a reason to
block a work unit or reset the ledger.

**F. Fallow risk on Slice 6.** `HistoryTimeline`/`use-history-timeline` ship with zero production
importers until Slice 7 wires the route (`HistoryRoute.tsx` still renders `HistoryTable`). If the
"no export without a consumer in the same commit" gate rejects this at Slice 6's commit, merge Slices 6
and 7 into one commit rather than shrinking Slice 6's tests to dodge the gate — the tests are not the
consumer that satisfies that rule, wiring into the route is.

**G. Worktree bootstrap (note, not a task).** A fresh worktree needs `bun install`, a placeholder
`frontend/dist/index.html`, `wails generate module`, then `bun run build` before anything else, because
`frontend/wailsjs/` and `frontend/dist` are gitignored and the root `//go:embed` needs `dist` to exist.
This worktree (`autoreas-bridge-worktrees/sdd-69-real-history`) already has them.

**H. Every remaining slice loads `lean-tests` at RED and at MUTATE.** A surviving mutant is killed with
a new row in that behavior's table, and REFACTOR runs before handoff. Slice 1 landed at 1,456 changed
lines partly because two survivors were killed with new test functions despite task 1.5.2 saying "new
table row".

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈5,620 across 9 units (`design.md`'s Size Forecast, `wc -l` comparables), plus ~30 lines of documentation in Slice 9 |
| 600-line budget risk | High for Slice 7 (declared exception below); tight (at/near cap) for Slices 1, 4, 6 |
| Chained PRs recommended | Yes |
| Suggested split | Nine chained commits (Slice 1 → 9) on `feat/sdd-69-real-history`, each independently shippable except the declared exception |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` — every slice lands as a sequential commit merging in order (CLAUDE.md #19b: `main` is deploy-only) |
| Declared `size:exception` | **Slice 7** — `/history` route switch + `HistoryTable` deletion + the now-fully-dead `AnimeHistoryItem`/`ListAnimeHistory`/`GetAnimeHistory` surface. Reason in Note E |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
600-line budget risk: High (Slice 7, declared size:exception)
```

`auto-chain` resolves `Decision needed before apply` to `No`: the chain strategy was already cached at
session start, so `sdd-apply` proceeds directly with Slice 1.

### Per-Slice Line Forecast

(`design.md`'s Size Forecast table, itself measured with `wc -l` over this tree's comparables —
`internal/activity` 313, `internal/sync` SDD-56 migration 898, `internal/persistence` 357,
`HistoryTable` 1,858, `AnimeRepetitionTimeline`+test 147, `app_desktop_actions.go` 130, ADR band 123-217.)

| Slice | Prod | Test | Prose | Total | Fits 600? |
|---|---:|---:|---:|---:|---|
| 1. `watch_history` schema + store | 200 | 330 | 60 | 590 | Yes, tight |
| 2. Diff-derived recorder on both write paths | 150 | 350 | 60 | 560 | Yes |
| 3. One-shot backfill + telemetry-row purge | 150 | 300 | 60 | 510 | Yes |
| 4. Telemetry → `runtime_events`; `activity_log` cap; ADR-022 | 110 | 230 | 240 | 580 | Yes, tight |
| 5. Wails bindings (additive) + frontend adapter + contracts | 120 | 180 | 50 | 350 | Yes |
| 6. `/history` timeline: grouping helpers + rows (unwired) | 220 | 320 | 60 | 600 | At the cap |
| 7. Three states + windowing guard + route switch + `HistoryTable` deletion | 200 + (−899) | 250 + (−959) | 90 | ≈2,398 | **No — declared `size:exception`** |
| 8. Anime Detail per-anime history section | 180 | 200 | 50 | 430 | Yes |
| 9. CHANGELOG + learning log | 0 | 0 | ~30 | ~30 | Yes |

The cap counts insertions **plus** deletions (`AGENTS.md` → Sizing a Change), so Slice 7's 899/959
removed lines count exactly like additions — there is nothing to trim from a deletion.

### Suggested Work Units

| Slice | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|
| 1 | `go test ./internal/watchhistory/...` | — (no wiring yet) | `git revert`; new package, inert if left behind |
| 2 | `go test ./internal/anime/... ./internal/desktop/...` | — | `git revert`; `watch_history` stays empty, no reader exists yet |
| 3 | `go test ./internal/sync/... ./internal/activity/...` | — | Non-trivial: restore point precedes any mutation; repair = drop table + clear marker + relaunch |
| 4 | `go test ./internal/desktop/... ./internal/activity/...` | — | `git revert`; cap is additive, telemetry reverts to `activity_log` (harmless) |
| 5 | `go test ./internal/desktop/... ./internal/anime/... ./internal/api/...` + `bun --cwd="frontend" run test -- bridge-runtime-source` | — | `git revert`; additive, no consumer yet |
| 6 | `bun --cwd="frontend" run test -- watch-history history-timeline` | — | `git revert`; unwired component |
| 7 | `bun --cwd="frontend" run test -- history` + `go test ./internal/anime/... ./internal/desktop/... ./internal/api/...` | `bun --cwd="frontend" run render:smoke` | `git revert` restores `HistoryTable` and the old bindings together — keep it linear, do not `git reset` |
| 8 | `bun --cwd="frontend" run test -- anime-detail anime-watch-history` | `bun --cwd="frontend" run render:smoke` | `git revert`; additive section only |
| 9 | — (docs only) | — | `git revert`; documentation only |

---

## Slice 1 — `watch_history` Schema + Derivation + Store

**Leaves the app working because:** a new, unwired package. Nothing calls it yet.
**Forecast:** 590 (tight). Requirements: `watch-history`'s "Recording Is Diff-Derived", "A Forward Step
Inserts One Row Per Newly Reached Episode", "A Backward Step Retracts Every Recorded Episode Above The
New Value", "A Zero-Delta Write Records Nothing", "Fractional Progress Is Accepted But Only Whole
Episodes Are Recorded", "A Retraction Below The Log's Floor Is A No-Op", "An Episode Is Never Recorded
Twice Within A Cycle", "A Cycle Reset Records Nothing And Retracts Nothing" (guard only — live wiring is
Slice 2/3), "Retraction Is Scoped To One Cycle", "The Anime Name Is Denormalized At Record Time", "Read
Models Are Keyset-Paged", "Retention Is Permanent" (no prune call is ever added — verified by absence).

**Measured at commit: 1,435 changed lines** (`git diff --cached --shortstat` against HEAD: 1,414
insertions + 21 deletions, of which 1,385 are code across 11 files and the rest is this file) — **against
a 590 forecast and a 600 budget. A planning miss per CLAUDE.md #22, not a block, and not a declared
size:exception.**

Root cause, measured: a fourth production file (`store_page.go`, 156 lines) that the design's own
`Page`/`AnimePage` contract required but the forecast never itemized; more RED scenarios than a 330-line
test estimate covers across twelve requirements; and mutation-forced additions once the first pass
scored below 0.80. Production landed at 409 lines against a forecast of 200, tests at 850 against 330,
so both sides missed — the overage is not "the tests ate the budget".

A genuine cleanup pass ran and moved the number by almost nothing, as CLAUDE.md #22's measured correction
predicts: one schema test removed as subsumed (`schema.go` generates zero mutants, and two other tests
already fail if the table is missing), and two single-step `Store` tests collapsed into a table. No
mutant-killing case was cut.

**Orchestrator verification found one claimed-but-unimplemented requirement.** Task 1.3.2 was checked and
the apply report said "conflict counting", but no counter existed: `insertEpisodes` only logged, and
`TestApplyConflictingInsertIsANoOpCountedAndWarnLogged` asserted "Counted" in its name without ever
counting. Mutation testing cannot catch this — it measures whether tests kill mutants of code that
exists, and absent code produces no mutants. Fixed before commit: `Store.conflicts atomic.Int64` plus
`Conflicts()`, tested in both directions (a conflict moves it 0 → 1; an ordinary insert leaves it at 0).

Final mutation, run by the orchestrator with no concurrent run on these files:
`internal/watchhistory` **0.91** (75 total, 68 killed, 7 survived; 3 of 78 generated never compiled and
are excluded) and `tools/checkarchitecture` **1.00** (9/9). The 7 survivors are traced equivalents —
e.g. `limit+1 → limit+2` only reads one extra row that `scanPage` discards, and `< → <=` on guard 4 never
sees equality because guard 3 intercepts it first.

### 1.1 Schema

- [x] **1.1.1** [RED] `internal/watchhistory/schema_test.go`: `SchemaTables()` returns the
  `watch_history` `persistence.TableSchema` with the DDL and three indexes from `design.md`'s
  Interfaces/Contracts block; `persistence.EnsureTableSchema` creates the table and indexes on a fresh
  in-memory DB — mirrors `internal/activity/schema_test.go`'s shape.
- [x] **1.1.2** [GREEN] `internal/watchhistory/schema.go`: the DDL (`id`, `anime_id`, `anime_name`,
  `episode INTEGER`, `cycle INTEGER`, `watched_at_ms`, `source`, `source_activity_id` nullable),
  `idx_watch_history_watched_at`, `idx_watch_history_anime`, the unique
  `idx_watch_history_episode (anime_id, cycle, episode)`, and `SchemaTables()`.

### 1.2 `Derive` — the pure function

- [x] **1.2.1** [RED] `internal/watchhistory/derive_test.go`: table-driven, one row per D2 guard —
  `CycleReset` → `EffectNone`; NaN/Inf/negative `After` → `EffectNone`; equal before/after →
  `EffectNone`; `After < Before` → `EffectRetract{Floor: After}`; over `maxEpisodesPerChange` →
  `EffectNone`; otherwise → `EffectRecord` with the integers in `(floor(Before), After]`. Jump cases:
  `2 → 5` ⇒ `[3,4,5]`; `10.5 → 13` ⇒ `[11,12,13]`; `11 → 11.5` ⇒ `[]`; `10.5 → 11` ⇒ `[11]`. Assert the
  over-bound literal against `5000` written as a literal, never against the production constant.
- [x] **1.2.2** [GREEN] `internal/watchhistory/derive.go`: `Change`, `EffectKind`, `Effect`, `Derive`,
  guard order exactly as D2's table.
- [x] **1.2.3** [RED] Property test: after any sequence of `Derive`-driven changes, the recorded set for
  `(anime_id, cycle)` equals the integers in `(firstObservedFloor, progress]` (the D2a invariant).
- [x] **1.2.4** [VERIFY] Expected to pass with no new production code — `Derive`'s guard order already
  satisfies the invariant; a failure here means the defect is in `Derive`, not in this test.

### 1.3 Store — `ApplyTx`/`Apply`, keyset `Page`, `AnimePage`

- [x] **1.3.1** [RED] `internal/watchhistory/store_test.go` against real SQLite (`persistence.EnsureTableSchema`
  + in-memory, mirroring `eventlog/store_test.go`): insert; retract; cross-cycle isolation (a cycle-2
  rollback leaves cycle 1 untouched); unmatched retraction is a no-op; oscillation round-trip
  (`11 → 10.5 → 11` leaves the same set, a new `id`/`watched_at_ms`); an `ON CONFLICT` collision is
  counted and warn-logged, never silently swallowed.
- [x] **1.3.2** [GREEN] `internal/watchhistory/store.go`: `ApplyTx(ctx, tx, change)`, `Apply(ctx, change)`
  (owns its own transaction), the conflict counter + warn log.
- [x] **1.3.3** [RED] Cursor encode/decode, limit clamping, equal-timestamp tiebreak — opaque
  `"<watched_at_ms>:<id>"`, matching `eventlog.EventSearchPage`'s `NextCursor` convention.
- [x] **1.3.4** [GREEN] `Page(ctx, PageQuery)` and `AnimePage(ctx, animeID, PageQuery)`, riding
  `idx_watch_history_watched_at` / `idx_watch_history_anime` respectively.

### 1.4 `tools/checkarchitecture` — second owned table

- [x] **1.4.1** [RED] Extend the checker's existing test suite: a file outside `internal/watchhistory/`
  containing the literal `watch_history` (including in a comment) fails the scan, mirroring the existing
  `activity_log` rule.
- [x] **1.4.2** [GREEN] `tools/checkarchitecture/main.go`: register the second owned-table rule.

### 1.5 MUTATE — `Derive` is guard-dense (CLAUDE.md #16; mandatory per design.md's own table)

- [x] **1.5.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/watchhistory/"`. Confirm every mutant in `design.md`'s "MUTATE — the
  guards whose mutants must die" table dies: the `>`/`>=`/`<`/`<=` flips, the loop start/condition
  off-by-ones, the retraction boundary, the dropped cycle predicate, the negated `CycleReset` guard, the
  zero-affected-rows-becomes-error mutant, the removed non-finite guard. **Correction applied at apply
  time:** the negated `Outcome != Applied` guard does not exist in Slice 1 — `Derive` is pure and carries
  no `Outcome` field; that mutant belongs to Slice 2's write-path wiring (`recordEpisodeAdjustment` /
  `PatchAnime`'s outcome check), not to this table. Ran scoped to `./internal/watchhistory/` only
  (`--exclude-prefix tools/` added): `tools/checkarchitecture/main.go`'s staged hunk was also present in
  the diff but is untested by that command, which inflated survivors to false positives; it got its own
  separate `ditto` pass scoped to `./tools/checkarchitecture/` (score 1.00). Final scores: `watchhistory`
  0.90 (66/73, 7 accepted-equivalent survivors documented in apply-progress), `checkarchitecture` 1.00.
- [x] **1.5.2** [REFACTOR] Kill any survivor with a new table row (never a hand-tweak that only kills
  that one mutant).

### 1.6 Verification & commit

- [x] **1.6.1** [VERIFY] `go test ./internal/watchhistory/... ./tools/checkarchitecture/...`; both
  golangci profiles; `go run ./tools/checkgofilesize`; `git status --porcelain` scoped to this slice.
- [x] **1.6.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. A new, unwired package; a registry-created table left behind is inert.

---

## Slice 2 — Diff-Derived Recording On Both Write Paths

**Leaves the app working because:** the recorder is wired but nothing reads `watch_history` yet — a
`RecordWatch` failure degrades (D4), so the user-visible episode/repeat flows are unaffected either way.
**Forecast:** 560. Requirements: "Recording Is Diff-Derived, Never `action_type`-Derived" (live paths),
"`SetAnimeDays` Records Nothing", "A Cycle Reset Records Nothing And Retracts Nothing" (live wiring),
"The Anime Name Is Denormalized At Record Time" (live writes populate it).

### 2.1 `anime.WatchRecorder` port + `EpisodeService` wiring

- [x] **2.1.1** [RED] `internal/anime/episode_service_test.go`: `AdjustWatchedEpisodes` calls
  `WatchRecorder.RecordWatch` with `Change{Before, After, Cycle: len(current.Repetitions)+1, Source,
  OccurredAtMS}` after `RecordActivity`; a `RecordWatch` error is warn-logged under
  `domain="watch-history"` and the command still reports success (D4); `SetAnimeDays` never calls
  `RecordWatch`.
- [x] **2.1.2** [GREEN] `internal/anime/episode_service.go`: `WatchRecorder` interface —
  `RecordWatch(ctx, watchhistory.Change) error`; add it to `EpisodeServiceDeps`; call it immediately
  after the existing `RecordActivity` call in `recordEpisodeAdjustment`; never call it from
  `episode_service_schedule_state.go`.
- [x] **2.1.3** [RED] `episode_service_repeat_restore_test.go`: `RepeatAnime` calls `RecordWatch` with
  `CycleReset: true`, asserting (through the store) zero inserts and zero deletions.
- [x] **2.1.4** [GREEN] `internal/anime/episode_service_repeat_restore.go`: wire the `RepeatAt`-derived
  `Change` into the same `RecordWatch` call.

### 2.2 Desktop wiring — `watchRecorderAdapter` + mobile path

- [x] **2.2.1** [RED] `internal/desktop/app_watch_history_test.go` (new): `watchRecorderAdapter.RecordWatch`
  delegates to `watchhistory.Store.Apply`; `App` wires it into both `episodeService` and
  `activityAnimeWriteService`.
- [x] **2.2.2** [GREEN] `internal/desktop/app.go`: `watchRecorderAdapter` struct + wiring at construction.
- [x] **2.2.3** [RED] `internal/desktop/app_activity_write_test.go`: `activityAnimeWriteService.PatchAnime`
  computes `Cycle` from the loaded `before` anime's `Repetitions`, and calls `RecordWatch` after
  `recordPatchActivity`, using the before/after diff — never `activityPatchOutcome`'s derived
  `actionType`; a `RepeatAt` patch calls `RecordWatch` with `CycleReset: true`.
- [x] **2.2.4** [GREEN] `internal/desktop/app_activity_write.go`: add a `watchRecorder anime.WatchRecorder`
  field to `activityAnimeWriteService`; call `RecordWatch` in `PatchAnime` after `recordPatchActivity`,
  deriving `Cycle` the same way as the desktop path.

**Addition beyond the plan:** `internal/sync/sqlite_bootstrap.go` registers `watchhistory.SchemaTables()`
(moved up from 3.3.3, since this slice is the first to write at runtime). Its proof,
`internal/watchhistory/bootstrap_registration_test.go`, goes through the real `OpenBridgeDB`, and cannot
live in `internal/sync/` because the `watch_history` architecture rule has no bootstrap exception.

### 2.3 MUTATE

- [x] **2.3.1** [MUTATE] `ditto staged … ./internal/anime/` — **1.00** (25/25).
- [x] **2.3.2** [MUTATE] `ditto staged … ./internal/desktop/` — **1.00** (13/13). `./internal/sync/`
  yields no mutants: the registration line has no branch.
- [x] **2.3.3** [REFACTOR] Two passes before commit. The second removed duplicated proof: the D4 guard
  moved into one exported `anime.RecordWatch` (desktop's copy and its 3-row truth table deleted), the
  repeat's watch-history assertions left the snapshot test for a focused test of their own, and a
  redundant adapter test was deleted after skipping it left desktop mutation at 1.00.

### 2.4 Verification & commit

- [x] **2.4.1** [VERIFY] Tests, vet, both lint profiles, `checkarchitecture` and `checkgofilesize` clean.
  **639 changed lines of code** against a 560 forecast and the 600 budget, down from 743 — a planning
  miss per CLAUDE.md #22. The unforecast part is the real-store proof of the repeat and the bootstrap
  registration test, neither of which the forecast itemized.
- [x] **2.4.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. `watch_history` stays empty; no reader exists until Slice 5/7.

---

## Slice 3 — One-Shot Backfill + Telemetry-Row Purge

**Leaves the app working because:** a bootstrap-time migration that degrades on failure (D6) — a broken
backfill leaves an empty history and retries next launch, it never blocks startup.
**Forecast:** 510. Requirements: "The Backfill Anchors Cycles To The Current Repetition Count", "The
Backfill Is Marker-Guarded And Idempotent", "The Backfill Creates A Restore Point Before Mutating".

**Apply notes:** trap 3 — the replay is buffered before `BEGIN` (`SetMaxOpenConns(1)` would starve a tx opened
while the SELECT holds the connection). Trap 4 — `R` = `json_array_length(snapshot_json.$.repetitions)`; an anime
with no snapshot row reads `R=0`. The purge became `DeleteNavigationTelemetry` with literal action types, so
Slice 4.1.4 can drop the constants without touching the backfill. Measured on a sandbox copy of the real
database: 201 rows over 36 anime, 277 navigation rows purged (394 audit rows left), restore point created.
Both repeated anime hold only cycle-2 rows: the log has no progress before either reset. Mutation: sync 0.95
(39/41; survivors `cycleFor` clamp `<=`/`1→2`, equivalent), activity 0.94 (17/18) before the refactor that
removed the variadic guard and its equivalent mutant.

### 3.1 Activity ports — replay + purge (SQL stays in `internal/activity`)

- [x] **3.1.1** [RED] `internal/activity/store_test.go`: `CountReplayable` counts the replay input;
  `StreamOldestFirst` streams `occurred_at_ms ASC, id ASC` and decodes `before_json`/`after_json` into
  `anime.Snapshot{Estado, NroCapVisto, Activo}` using the exact untagged Go field names (D2's
  storage-format note — this is the retained Spanish-adjacent surface, CLAUDE.md #13);
  `DeleteNavigationTelemetry(tx)` deletes only the four navigation action types and returns the count.
- [x] **3.1.2** [GREEN] `internal/activity/store.go`: add the three methods.

### 3.2 Cycle alignment — anchored backwards from `R` (D3)

- [x] **3.2.1** [RED] `internal/sync/watch_history_backfill_test.go`: `R=3, K=0` (the default, 59-of-61
  case, per Note B) — every replayed row lands on cycle 4, and a subsequent live `RecordWatch` computes
  the same cycle 4. `R=1, K=1` (Date a Live II shape) — pre-reset segment 1, post-reset 2. `K > R` —
  per-row clamp, final segment still `R+1`, the resulting key collision is counted and warn-logged with
  the anime, `R`, and `K`.
- [x] **3.2.2** [GREEN] `internal/sync/watch_history_backfill.go`: `cycle(P) = max(1, R + 1 -
  resetsStrictlyAfter(P))` applied per row — never seeded once and then incremented.

### 3.3 Driver — marker, restore point, replay, purge (D6)

- [x] **3.3.1** [RED] Idempotent replay: running the migration twice yields the same row set. Marker
  skips a second run outright. Fresh-install path (`CountReplayable` = 0) sets the marker and creates
  **no** restore point. A mid-replay failure rolls back, logs at `error`, and sets no marker (bootstrap
  still succeeds). The purge of the 4 navigation action types runs inside the same transaction as the
  replay, after every row is applied.
- [x] **3.3.2** [GREEN] `internal/sync/watch_history_backfill.go`: `ensureWatchHistoryBackfill(ctx, db,
  dbPath)` — marker check → `CountReplayable` → `CreateRestorePoint` (only if rows > 0) → buffer `StreamOldestFirst` → `BEGIN` →
  per-row `Derive` via the `watchhistory` port → `ApplyTx` →
  `DeleteNavigationTelemetry` → set marker → `COMMIT`; any error → `ROLLBACK` + log error, no
  marker set.
- [x] **3.3.3** [GREEN] **Schema registration moved to Slice 2** (see that slice's note beside 2.2.4 and
  its apply report): `watchhistory.SchemaTables()` is already appended to `initializeBridgeDB`'s `tables`
  slice, proven by `internal/watchhistory/bootstrap_registration_test.go`. This task now only calls
  `ensureWatchHistoryBackfill` from `internal/sync/sqlite_bootstrap.go`'s `initializeBridgeDB`, after
  every table is ensured and after `ensureVocabularyMigration`.
- [x] **3.3.4** [RED] Fixtures built from the real `activity_log` row shape (untagged snapshot keys)
  replayed against the corrected rules (`CycleReset` guard + backwards cycle anchoring); **re-measure and
  record the resulting row count** (the explore.md §4.1 / design.md "> 201" open item) in the test name
  or a comment — measured, not estimated.

### 3.4 MUTATE

- [x] **3.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/sync/"`.
- [x] **3.4.2** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/sync/
  --threshold 0.80 --test-command "go test -count=1 -json ./internal/activity/"`.
- [x] **3.4.3** [REFACTOR] Address survivors.

### 3.5 Verification & commit

- [x] **3.5.1** [VERIFY] `go test ./internal/sync/... ./internal/activity/...`; both golangci profiles;
  `checkgofilesize`; confirm a fresh `bridge.db` boot (empty log) sets the marker and creates no restore
  point.
- [x] **3.5.2** Orchestrator verifies and commits this slice.

**Rollback:** the one non-trivially-reversible slice. `CreateRestorePoint` runs before any mutation;
documented repair is drop `watch_history` + clear its `schema_migration_markers` row + relaunch, which
replays from `activity_log` (proposal's Rollback Plan).

---

## Slice 4 — Telemetry Relocation + `activity_log` Retention Cap

**Leaves the app working because:** the four desktop actions still work identically from the user's
point of view; only where their telemetry lands changes.
**Forecast:** 580 (tight), re-planned after Slices 1–3 each landed ~1.7× their forecast: ADR-022 moves
to Slice 9, and the slice runs as two work units, 4a (4.1) and 4b (4.2–4.3), each committed on its own. Requirement: `observability`'s MODIFIED "Activity Log Remains Untouched By
Runtime-Event Persistence" (both scenarios).

### 4.1 Telemetry relocation (D7)

- [x] **4.1.1** [RED] `internal/desktop/app_desktop_actions_test.go`: the four actions (`OpenAnimePage`,
  `CopyAnimePage`, `OpenAnimeFolder`, `CopyAnimeFolder`) emit through the shared logger instead of
  `activity.Store`; the emitted event carries `domain="anime"`, `event_type` = `"anime.folder_opened"` /
  `"anime.page_opened"` / `"anime.folder_copied"` / `"anime.page_copied"`, `entity_id` = the anime id,
  `correlation_id` = the existing `"anime.desktop-action:<id>:<ms>"` unchanged, `metadata_json` =
  `{"animeName": …, "source": "desktop"}` bounded via `boundMetadataJSON`; `runAnimeDesktopAction`'s
  "recording failed → error result" branch is gone (`Logf` returns nothing — D7); a nil `a.sharedLogger`
  degrades silently, mirroring every other lazily-wired `App` collaborator.
- [x] **4.1.2** [GREEN] `internal/desktop/app_desktop_actions.go`: replace `recordDesktopAnimeAction`'s
  `activity.Store.RecordActivity` call with the shared-logger path for these four actions only (leave
  `EpisodeService`'s own `RecordActivity` calls for progress/state changes untouched).
- [x] **4.1.3** [RED] A compile-level check (or targeted test) that no reference remains to
  `ActionAnimePageOpened`, `ActionAnimePageCopied`, `ActionAnimeFolderOpened`, `ActionAnimeFolderCopied`
  outside historical/fixture data.
- [x] **4.1.4** [GREEN] `internal/activity/store.go`: drop the four navigation action constants and their
  `internal/anime` mirrors (`ActivityActionAnimePageOpened` and siblings), updating
  `app_desktop_actions.go`'s call sites to use the `eventlog` event-type strings directly.

**Apply note (4.1):** 4.1.3 needed no separate test — deleting the constants (4.1.4) plus their two
remaining fixture references (now literal `"anime_page_opened"`) is the compile-level check; `go
build`/`go vet` pass clean. Measured: 76 insertions + 79 deletions across 6 files.

### 4.2 `activity_log` retention cap (D8)

- [x] **4.2.1** [RED] `internal/activity/store_test.go`: `pruneOldestBeyondRetention` deletes the oldest
  rows beyond a small `RowCap` via `NewStoreWithRetention`; the prune runs unconditionally on the first
  write of a process, mirroring `eventlog/store_test.go`'s cadence test; `NewStore(provider)` keeps its
  zero-value-default signature so no existing call site breaks.
- [x] **4.2.2** [GREEN] `internal/activity/store.go`: `StoreRetention{RowCap, PruneEvery}`,
  `NewStoreWithRetention(provider, retention)`, defaults `RowCap=5000, PruneEvery=200`; `RecordActivity`
  becomes `BEGIN / INSERT / prune / COMMIT`.

**Apply note (4.2):** two focused tests (acts differ: unconditional-first-write vs.
cadence-skip-then-enforce), mirroring eventlog/syncdiag's shape rather than one table.

### 4.3 Confirm the 371 dead `anime`-domain rows are inert (verification, not migration — D7)

- [x] **4.3.1** [VERIFY] Confirm (against the live `runtime_events` table or an equivalent fixture) that
  every pre-existing `domain="anime"` row carries the single tracer-bullet message, empty
  `correlation_id`/`entity_id`, a null `event_type`, and none newer than 2026-08-30. Record the
  confirmation as a test assertion distinguishing real rows (non-null `event_type`) from the residue.
  No delete, no migration, no domain rename.

**Apply note (4.3):** no existing filter/search test distinguished a null-`event_type` residue row from
a populated one; added one to `reader_search_test.go` seeding the measured residue shape.

### 4.4 ADR-022 — moved to Slice 9 (9.3.1)

### 4.5 MUTATE

- [ ] **4.5.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/activity/
  --threshold 0.80 --test-command "go test -count=1 -json ./internal/desktop/"`.
- [ ] **4.5.2** [MUTATE] `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/desktop/
  --threshold 0.80 --test-command "go test -count=1 -json ./internal/activity/"`.
- [ ] **4.5.3** [REFACTOR] Address survivors.

### 4.6 Verification & commit

- [ ] **4.6.1** [VERIFY] `go test ./internal/desktop/... ./internal/activity/...`; both golangci
  profiles; `checkgofilesize`; `git diff --stat -- docs/openapi.yaml` is empty (no REST/WS surface
  touched).
- [ ] **4.6.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. An older build's `activity_log` keeps navigation rows again (harmless); the
cap is additive.

---

## Slice 5 — Wails Bindings (Additive) + Frontend Adapter + Contracts

**Leaves the app working because:** purely additive — the old `AnimeHistoryItem`/`ListAnimeHistory`/
`GetAnimeHistory`/`getAnimeHistory()` surface stays exactly as-is (Note A); `HistoryTable` keeps working
unmodified.
**Forecast:** 350. No direct spec requirement beyond "Read Models Are Keyset-Paged" (the bindings expose
`Page`/`AnimePage`); this slice is the plumbing the `anime-history` surface (Slice 6/7) will consume.

### 5.1 Contracts (additive)

- [x] **5.1.1** [RED] `internal/api/contracts/contracts_english_test.go`: `WatchHistoryEntry` and
  `WatchHistoryPage` have English JSON tags.
- [x] **5.1.2** [GREEN] `internal/api/contracts/contracts.go`: add `WatchHistoryEntry{ID, AnimeID,
  AnimeName, Episode, Cycle, WatchedAtMS, Source}` and `WatchHistoryPage{Items []WatchHistoryEntry,
  NextCursor, Status, Message}`. `AnimeHistoryItem` is untouched (Note A).

### 5.2 Wails bindings (additive)

- [x] **5.2.1** [RED] `internal/desktop/app_runtime_test.go`: `GetWatchHistoryPage(cursor)` and
  `GetAnimeWatchHistoryPage(animeID, cursor)` degrade to `WatchHistoryPage{Status: "error", ...}` on a
  nil watch-history service, mirroring `GetAnimes`'s nil-guard contract; a successful call passes
  through `Store.Page`/`AnimePage`'s cursor and items. `GetAnimeHistory` is untouched (Note A).
- [x] **5.2.2** [GREEN] `internal/desktop/app_runtime.go`: add the two new bindings beside the existing
  `GetAnimeHistory`.

### 5.3 Frontend adapter + types (additive)

- [x] **5.3.1** [RED] `frontend/src/infrastructure/__tests__/bridge-runtime-source-*.test.ts` (extend or
  add): the adapter maps `GetWatchHistoryPage`/`GetAnimeWatchHistoryPage`'s Go DTO into the frontend
  `WatchHistoryPage`/`WatchHistoryEntry` shape. The existing `getAnimeHistory()` call is untouched.
- [x] **5.3.2** [GREEN] `frontend/src/infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts`:
  wire the two new calls; `frontend/src/shared/contracts/anime.types.ts`: add `WatchHistoryEntry`/
  `WatchHistoryPage` (every property `readonly`) beside the existing `AnimeHistoryItem`.

**Apply note (5.1-5.3):** 306 Go + 117 frontend insertions (423 total) against a 350 forecast, inside the
600 budget. Note C's literal ban also caught doc comments ("watch_history" -> reworded, `checkarchitecture`
caught it); `fallow audit --quiet` clean, no unused-export finding.

### 5.4 MUTATE

- [ ] **5.4.1** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/desktop/"`, then repeated scoped to `./internal/api/...` if the
  contracts package carries any branching logic worth scoring (thin DTOs are expected to yield few or no
  mutants — do not skip the run on that assumption).
- [ ] **5.4.2** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to the touched
  adapter/types files.
- [ ] **5.4.3** [REFACTOR] Address survivors.

### 5.5 Verification & commit

- [ ] **5.5.1** [VERIFY] `go test ./internal/desktop/... ./internal/api/...`; `bun --cwd="frontend" run
  test -- bridge-runtime-source`; both golangci profiles; `checkgofilesize`; `git diff --stat --
  docs/openapi.yaml` empty.
- [ ] **5.5.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. Purely additive; no consumer exists yet.

---

## Slice 6 — `/history` Timeline: Grouping Helpers + Rows (Unwired)

**Leaves the app working because:** `HistoryTimeline` and its hook exist but `HistoryRoute.tsx` still
renders `HistoryTable` — the live route is untouched.
**Forecast:** 600 (at the cap — see Note F for the fallow risk this carries). Requirements:
`anime-history`'s "Episode Timeline Is Grouped By Day", "The Whole Row Drills Down To Anime Detail",
"History Timestamps Read Well", "English UI Copy with Spanish Data Literals Preserved" (for the
rows/headings authored here).

### 6.1 Shared day-grouping/formatting helpers

- [ ] **6.1.1** [RED] `frontend/src/shared/watch-history/__tests__/watch-history.helpers.test.ts`:
  `toLocalDayKey(epochMs)` maps to the correct local calendar day; `groupEntriesByDay(entries)` groups
  strictly-descending-time rows into day buckets, marking only the trailing group `partial`;
  `formatDayHeading`/`formatRowTime`. Fixed timestamps, explicit timezone (UTC−3, matching the
  measurements), and a page-boundary fixture (two fetched pages splitting one local day) proving the
  trailing group's count settles once an older-day row arrives.
- [ ] **6.1.2** [GREEN] `frontend/src/shared/watch-history/watch-history.helpers.ts`,
  `watch-history.types.ts` (every prop `readonly`).

### 6.2 `HistoryTimeline` component + `use-history-timeline` hook

- [ ] **6.2.1** [RED] `frontend/src/features/history/ui/HistoryTimeline/__tests__/use-history-timeline.test.ts`:
  the hook accumulates pages by cursor and exposes grouped-by-day entries; no `useProgressiveListWindow`
  import anywhere in this module (Note D — not wired to scroll yet, that is Slice 7).
- [ ] **6.2.2** [GREEN] `frontend/src/features/history/ui/HistoryTimeline/use-history-timeline.ts`,
  `history-timeline.constants.ts`, `history-timeline.types.ts`. Strict hook anatomy order.
- [ ] **6.2.3** [RED] `frontend/src/features/history/ui/HistoryTimeline/__tests__/HistoryTimeline.test.tsx`:
  dumb-component render test — given grouped day data, renders day headings with counts and per-episode
  rows newest first; each row is a single keyboard-accessible drill-down affordance to Anime Detail. No
  Wails call, no `useEffect`, HeroUI + Tailwind only.
- [ ] **6.2.4** [GREEN] `frontend/src/features/history/ui/HistoryTimeline/HistoryTimeline.tsx`.

### 6.3 MUTATE

- [ ] **6.3.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice's
  files; read the per-file table, not the blended score.
- [ ] **6.3.2** [REFACTOR] Address survivors.

### 6.4 Verification & commit

- [ ] **6.4.1** [VERIFY] `bun --cwd="frontend" run test -- watch-history history-timeline`; ESLint
  `max-lines`; JSDoc lint (`dharness/require-jsdoc`).
- [ ] **6.4.2** [VERIFY] If the "no export without a consumer" fallow gate rejects `HistoryTimeline`/
  `use-history-timeline` as unconsumed at commit time, apply Note F (merge into Slice 7) instead of
  reworking this slice's test scope.
- [ ] **6.4.3** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. Unwired component; no route references it.

---

## Slice 7 — Three States + Windowing Guard + Route Switch + `HistoryTable` Deletion

**Declared `size:exception`** (Note E). **Leaves the app working because:** the route swap and the
deletion land in the same commit, so `/history` always has exactly one implementation rendering it.
**Forecast:** ≈2,398 (declared exception). Requirements: `anime-history`'s "Loading, Empty, and Error
States Are Exclusive", "The List Renders Progressively", "The History Route Carries No Persisted Query
State".

### 7.1 Three exclusive states (loading / empty / error)

- [ ] **7.1.1** [RED] Extend `HistoryTimeline.test.tsx`: loading renders only the skeleton
  (`role="status"`, `aria-live="polite"`, `aria-labelledby` → `sr-only` span) and never real rows (assert
  the negative); resolved-empty renders `shared/ui/AirisEmptyState` carrying the "history begins
  2026-07-05" sentence; failure renders the surface's error `Alert`. The three are mutually exclusive.
- [ ] **7.1.2** [GREEN] Wire the three states per CLAUDE.md FE #14's conventions.

### 7.2 DOM-count windowing guard (D5a / ADR-012's 2026-08-31 correction — mandatory)

- [ ] **7.2.1** [RED] `HistoryTimeline.windowing.test.tsx`, following
  `AnimeEditorWorkspace.windowing.test.tsx`'s shape: after the first load the DOM row count equals
  `PAGE_SIZE`; one near-bottom scroll event (via `isNearListBottom` on the wrapping `overflow-y-auto`
  div, never `Table.ScrollContainer`) fetches the next keyset page and grows the DOM row count by one
  further page. `Table.LoadMore`/`useLoadMoreSentinel` is never used (Note D).
- [ ] **7.2.2** [GREEN] Wire `onScroll` + `isNearListBottom` in `use-history-timeline.ts`.

### 7.3 Route switch + retired-module deletion (the size:exception unit)

- [ ] **7.3.1** [GREEN] `frontend/src/app/routes/HistoryRoute.tsx`: replace `<HistoryTable />` with
  `<HistoryTimeline />`.
- [ ] **7.3.2** [DELETE] Remove `frontend/src/features/history/ui/HistoryTable/**` in full
  (`HistoryTable.tsx`, `history-table.constants.ts`, `history-table.helpers.ts`, `history-table.types.ts`,
  `use-history-params-writers.ts`, `use-history-rows.ts`, `use-history-table.ts`, `__tests__/`) — in the
  same commit as 7.3.1, per Note E.
- [ ] **7.3.3** [RED/GREEN] `anime-history`'s "The History Route Carries No Persisted Query State": a
  route test asserting `/history` never grows query parameters across navigation, scrolling, or
  drill-down (extend `frontend/src/app/routes/__tests__/overview-surface-routing.test.ts` or add one).
- [ ] **7.3.4** [GREEN] Remove the surface whose last caller was `HistoryTable` (Note A): `internal/anime/
  service.go`'s `ListAnimeHistory` (+ its `AnimeQueryService` interface entry and
  `history_query_service_fixture_test.go`), `internal/api/contracts/contracts.go`'s `AnimeHistoryItem`,
  `internal/desktop/app_runtime.go`'s `GetAnimeHistory`, and the frontend adapter's `getAnimeHistory()`
  call plus any residual `AnimeHistoryItem` type reference.

### 7.4 MUTATE

- [ ] **7.4.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to `HistoryTimeline`/
  `use-history-timeline`/`HistoryRoute`'s touched lines (the deletion contributes no mutable lines).
- [ ] **7.4.2** [MUTATE] `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command
  "go test -count=1 -json ./internal/anime/"`, then repeated for `./internal/desktop/...` and
  `./internal/api/...`, scoped to the 7.3.4 removal's staged lines (expect little to no mutable surface —
  deletions only).
- [ ] **7.4.3** [REFACTOR] Address survivors.

### 7.5 Verification & commit

- [ ] **7.5.1** [VERIFY] `bun --cwd="frontend" run test -- history`; `bun --cwd="frontend" run
  render:smoke` (confirms `/history` renders non-blank, CLAUDE.md #18b); `go test ./internal/anime/...
  ./internal/desktop/... ./internal/api/...`; both golangci profiles; `checkgofilesize`; ESLint
  `max-lines`; a dead-code/unused-export audit shows zero remaining importers of the deleted module and
  zero orphaned exports; `git status --porcelain` scoped to this slice.
- [ ] **7.5.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert` restores `HistoryTable` and the old bindings together in one step — keep the
branch linear (`git revert`, never `git reset`) so this remains true.

---

## Slice 8 — Anime Detail Per-Anime History Section

**Leaves the app working because:** purely additive — a new section beside `AnimeRepetitionTimeline`.
**Forecast:** 430. Requirements: `watch-history`'s "Per-Anime History Surfaces On Anime Detail", "Back
Navigation From Detail No Longer Restores List State".

### 8.1 `AnimeWatchHistory` component + hook

- [ ] **8.1.1** [RED] `frontend/src/features/anime-detail/ui/AnimeWatchHistory/__tests__/...`: given an
  anime with recorded `watch_history` rows (via `GetAnimeWatchHistoryPage`), renders a section listing
  its episode history. Dumb component — HeroUI + Tailwind, no Wails call, no `useEffect` (the fetch lives
  in the `use-*` hook).
- [ ] **8.1.2** [GREEN] `AnimeWatchHistory.tsx`, `use-anime-watch-history.ts`,
  `anime-watch-history.types.ts` / `.constants.ts`.
- [ ] **8.1.3** [RED] Three-states test (loading / empty / error), mirroring
  `AnimeRepetitionTimeline.test.tsx`'s shape (measured comparable: 147 lines total).
- [ ] **8.1.4** [GREEN] Wire the three states.

### 8.2 Wire into `AnimeDetail`

- [ ] **8.2.1** [RED] `frontend/src/features/anime-detail/ui/AnimeDetail/__tests__/AnimeDetail.test.tsx`:
  the new section renders beside `AnimeRepetitionTimeline`.
- [ ] **8.2.2** [GREEN] `AnimeDetail.tsx`: render `<AnimeWatchHistory animeId={...} />` beside
  `<AnimeRepetitionTimeline ... />`.

### 8.3 Back navigation (supersedes sdd-37's exact-spot restore)

- [ ] **8.3.1** [RED] From Anime Detail reached via `/history`, back returns to `/history` with no
  restored page/search/filter state (there is none to restore). From Anime Detail reached without a
  `/history` entry in the navigation stack, back falls back to `/history`.
- [ ] **8.3.2** [GREEN] Wire ordinary router back navigation with a `/history` fallback; adjust only if
  the router still attempts to restore the retired query-state contract.

### 8.4 MUTATE

- [ ] **8.4.1** [MUTATE] `bun --cwd="frontend" run test:mutation:staged`, isolated to this slice's files.
- [ ] **8.4.2** [REFACTOR] Address survivors.

### 8.5 Verification & commit

- [ ] **8.5.1** [VERIFY] `bun --cwd="frontend" run test -- anime-detail anime-watch-history`; `bun
  --cwd="frontend" run render:smoke`; ESLint `max-lines`; JSDoc lint.
- [ ] **8.5.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. Additive section; no route or contract removed.

---

## Slice 9 — Documentation & Housekeeping

**Leaves the app working because:** documentation only, zero production code touched.
**Forecast:** ~30 (prose only).

### 9.1 CHANGELOG

- [ ] **9.1.1** Add an entry to `CHANGELOG.md`'s `[Unreleased]` section (Keep a Changelog headings,
  English, user-facing wording, not pasted commit subjects): real per-episode watch history, the new
  `/history` timeline, and the per-anime history section on Anime Detail.

### 9.2 Learning log

- [ ] **9.2.1** `node scripts/log-lesson.mjs "<one sentence, <=300 chars>"` — record the non-obvious
  decision worth keeping. Candidates: the D3 cycle-anchoring correction over the explore's naive forward
  count (it would have mis-assigned 59 of 61 repeated animes), or the sequencing fix that kept
  `GetAnimeHistory`/`ListAnimeHistory` alive through Slice 6 to avoid breaking the still-live
  `HistoryTable` before its deletion.

### 9.3 ADR-022 (moved from Slice 4 so every code slice stays under the cap)

- [ ] **9.3.1** Write `docs/adr/022-watch-history-model.md`: the selected model (browser-history analogy,
  one row per episode with its own timestamp, retraction deletes the row), the two rejected alternatives
  (one-entry-per-log-row, day digest) with their measured noise ratios, the multi-episode
  jump/enumeration decision (D2a), the anime-domain-residue finding, and the three-lifetimes rule
  (permanent / capped / rotating) — content drawn from `design.md`'s "ADR-022 rationale" section, in the
  repo's ADR format (measured band: 123-217 lines).

### 9.4 Verification & commit

- [ ] **9.4.1** [VERIFY] `git status --porcelain` shows only `CHANGELOG.md`, `docs/learning-log.md` and
  `docs/adr/022-watch-history-model.md`.
- [ ] **9.4.2** Orchestrator verifies and commits this slice.

**Rollback:** `git revert`. Documentation only.

---

## Requirement → Task Coverage Matrix

| Spec | Requirement | Closed by |
|---|---|---|
| `watch-history` | Recording Is Diff-Derived, Never `action_type`-Derived | 1.2, 2.1.1–2.1.4, 2.2.3–2.2.4 |
| `watch-history` | A Forward Step Inserts One Row Per Newly Reached Episode | 1.2.1–1.2.2 |
| `watch-history` | A Backward Step Retracts Every Recorded Episode Above The New Value | 1.2.1–1.2.2, 1.3.1 |
| `watch-history` | A Zero-Delta Write Records Nothing | 1.2.1–1.2.2 |
| `watch-history` | Fractional Progress Is Accepted But Only Whole Episodes Are Recorded | 1.2.1–1.2.2, 1.3.1 (oscillation) |
| `watch-history` | A Retraction Below The Log's Floor Is A No-Op | 1.3.1 |
| `watch-history` | An Episode Is Never Recorded Twice Within A Cycle | 1.1, 1.3.1–1.3.2 |
| `watch-history` | A Cycle Reset Records Nothing And Retracts Nothing | 1.2.1–1.2.2 (guard), 2.1.3–2.1.4 (live), 3.2 (backfill) |
| `watch-history` | Retraction Is Scoped To One Cycle | 1.3.1–1.3.2 |
| `watch-history` | The Backfill Anchors Cycles To The Current Repetition Count | 3.2 |
| `watch-history` | `SetAnimeDays` Records Nothing | 2.1.1–2.1.2 |
| `watch-history` | The Anime Name Is Denormalized At Record Time | 1.3.2, 2.1.1–2.1.2, 2.2.3–2.2.4 |
| `watch-history` | Read Models Are Keyset-Paged | 1.3.3–1.3.4, 5.2 |
| `watch-history` | Per-Anime History Surfaces On Anime Detail | 8.1–8.2 |
| `watch-history` | Back Navigation From Detail No Longer Restores List State | 8.3 |
| `watch-history` | Retention Is Permanent | 1.1 (no prune call exists), verified absent throughout |
| `watch-history` | The Backfill Is Marker-Guarded And Idempotent | 3.3.1–3.3.3 |
| `watch-history` | The Backfill Creates A Restore Point Before Mutating | 3.3.1–3.3.3 |
| `anime-history` | Episode Timeline Is Grouped By Day | 6.1–6.2 |
| `anime-history` | The Whole Row Drills Down To Anime Detail | 6.2.3–6.2.4 |
| `anime-history` | Loading, Empty, and Error States Are Exclusive | 7.1 |
| `anime-history` | The List Renders Progressively | 7.2 |
| `anime-history` | The History Route Carries No Persisted Query State | 7.3.3 |
| `anime-history` | History Timestamps Read Well | 6.1 |
| `anime-history` | History Is Its Own Top-Level Section | Unchanged — no task; verified at 7.5.1 |
| `anime-history` | English UI Copy with Spanish Data Literals Preserved | 6.2, 7.1 |
| `observability` | Activity Log Remains Untouched By Runtime-Event Persistence (MODIFIED) | 4.1, 4.2 |

## Conventions Applied Throughout (not repeated per task)

- Every implementation task follows RED → GREEN → MUTATE → REFACTOR (CLAUDE.md #16).
- Go MUTATE always names the owning package's test command and keeps `-json`; each invocation excludes
  the *other* touched Go package's prefix so `ditto staged` never scores files outside the named test's
  coverage.
- Frontend MUTATE isolates to the slice's own touched files and reads the per-file table, never the
  blended score.
- Mandatory JSDoc on every new/modified frontend declaration; every `*Props` property `readonly`; no
  `index.ts` barrels; strict colocation (`__tests__/` beside the files it tests); strict hook anatomy
  order.
- Never assert against a production constant being pinned (e.g. `maxEpisodesPerChange`); write expected
  values as literals.
- `internal/anime.ActivityAnimeSnapshot` and its stored JSON keys (`Estado`/`NroCapVisto`/`Activo`) carry
  no JSON tags and are never English-ified — this is the retained storage-format surface (CLAUDE.md #13).
- Go files stay under the 400-line warning / 500-line hard-fail effective-line policy;
  `tools/checkgofilesize/baseline.yaml` stays empty.
- `docs/openapi.yaml` owes no diff for this change — every new surface is a Wails binding, not REST/WS.
