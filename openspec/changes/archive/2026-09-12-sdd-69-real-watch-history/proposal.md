# Proposal: Real Watch History (SDD-69)

## Intent

`/history` is a snapshot projection, not a log. `QueryService.ListAnimeHistory`
(`internal/anime/service.go:141`) emits one row per anime from the current snapshot's
`LastWatchedAt`, so the screen answers *which animes have I touched* and cannot answer *what did I
watch last night*. Meanwhile `activity_log` **is** an append-only event log — 671 rows spanning
2026-07-05 → 2026-09-11 — and `Store.ListRecent` (`internal/activity/store.go:111`) has zero
production callers. The log already exists; nothing reads it.

This change materialises a real watch history out of that log and separates the three lifetimes
currently collapsed into one table: permanent watch facts, capped audit diffs, rotating diagnostics.

## Scope

### In Scope

- New `watch_history` table: one row per episode watched, with its own timestamp. A forward progress
  step inserts; a backward step deletes the episodes above the new value.
- Facts derived from the `before_json`/`after_json` **diff**, never from `action_type` — which is
  measurably wrong on 21 rows (`activityPatchOutcome` uses sequential `if`, not `else if`).
- Recording on both write paths: desktop `EpisodeService` and mobile `activityAnimeWriteService`.
- One-shot, marker-guarded backfill replaying `activity_log` into `watch_history`, then deleting the
  277 navigation-telemetry rows.
- Navigation telemetry (`anime_folder_opened`, `anime_page_opened`, `anime_folder_copied`,
  `anime_page_copied`) moves to `runtime_events` via `internal/observability/eventlog`.
- `activity_log` keeps its shape and audit job, and gains the retention cap it is the only bridge
  table to lack.
- `/history` becomes a browser-style list: day headings with a count, one row per episode, newest
  first. `ListAnimeHistory` and its read model are removed.
- Anime Detail gains a per-anime history section beside `AnimeRepetitionTimeline`.
- ADR-023 recording the selected model and the two rejected alternatives.

### Out of Scope

- **`SetAnimeDays` stays silent.** `episode_service_schedule_state.go:89` deliberately rewrites
  `dias[]` without recording a watch-state entry. Scheduling is not watch history, and this change
  does not make it one.
- **History cannot precede 2026-07-05**, where `activity_log` begins. An anime at episode 39 whose
  log starts at 30 shows 30–39. That is the only thing the data supports; the surface says so rather
  than implying completeness.
- Fixing the `activityPatchOutcome` `action_type` precedence defect. This change bypasses it by
  deriving from the diff; the fix is a separate change.
- `watch_history` in backup bundles. `openspec/specs/backup-import-export/spec.md:174-183` enumerates
  the excluded tables and `watch_history` joins neither list, so no guard scenario covers it —
  flagged as a follow-up, not silently resolved here.
- Retention for `watch_history`: permanent by design.
- **Archiving `2026-07-03-sdd-35/36/37`.** Those three unarchived changes hold the only copy of the
  `anime-history` and `anime-detail` contracts. Promoting or archiving them is a separate housekeeping
  decision; SDD-69 flags it and leaves them alone.
- REST/WS surface. `/history` is a Wails binding; `docs/openapi.yaml` has no history route and owes
  no announcement.

## Capabilities

### New Capabilities

- `watch-history`: the table, the diff-derived recording and retraction semantics, the global and
  per-anime read models, the permanent-retention posture, and the one-shot backfill. **Also carries
  the per-anime history section on Anime Detail** — see "Why `anime-detail` takes no delta" below.
- `anime-history`: **a full new capability spec, not a MODIFIED delta.** SDD-69 replaces this
  contract wholesale and there is no parent to delta against (below). `sdd-spec` writes
  `openspec/changes/.../specs/anime-history/spec.md` as a complete spec carrying forward the
  requirements that survive.

### Modified Capabilities

- `observability`: "Activity Log Remains Untouched By Runtime-Event Persistence"
  (`openspec/specs/observability/spec.md:576-585`). Its "`activity_log`'s existing per-anime
  audit-trail behavior is unchanged" clause stops holding — four action types stop being written and
  a retention cap arrives. The distinct-table guarantee itself survives unchanged. This is the only
  **promoted** spec SDD-69 touches, so it is the only true delta.

### Why there is no parent to delta against

`anime-history` and `anime-detail` have **no main spec**. `openspec/specs/` has no entry for either.
Both exist only as delta specs inside three changes that were never archived:
`2026-07-03-sdd-35-catalog-history`, `-sdd-36-history-legacy-parity`, `-sdd-37-history-detail-polish`.
This is the situation SDD-67 hit with `backup-import` and `keymap-customization`. **`sdd-spec` must
not go hunting for a parent spec — there is none.**

### What SDD-69 supersedes in `anime-history`

| Requirement | Origin | Fate under SDD-69 |
|---|---|---|
| History Read Model | sdd-35, MODIFIED by sdd-36 | **Superseded.** sdd-36 defined membership as "animes with a present `fechaUltCapVisto`", ordering as `fechaUltCapVisto` DESC, one row per anime, and "no new persistence and no write path". SDD-69 removes every clause: membership is one row per episode watched, ordering is by the episode's own timestamp, and there **is** new persistence and a write path |
| History Table With Pagination, Search, and Filters | sdd-36, MODIFIED by sdd-37 | **Superseded**, except whole-row drill-down to detail, which survives. Numbered pagination, debounced name search, Estado/Tipo filters and the Orden control all go |
| History State Survives Navigation (URL-Persisted) | sdd-37 | **Superseded.** `q`, `estado`, `tipo`, `sort`, `page` are gone; the new spec MUST state the replacement URL-state contract (explore.md § 8.4) |
| History Timestamps Read Well | sdd-36 | **Partially superseded.** The per-row long-date/weekday/time columns go — the day heading carries the date, the row carries the time. The "one timestamp drives every derived field via tested helpers" discipline is carried forward |
| History Is Its Own Top-Level Section | sdd-36 | **Survives unchanged.** Carried forward verbatim |
| English UI Copy with Spanish Data Literals Preserved | sdd-35 | **Survives unchanged.** Carried forward verbatim |
| History Reached Without an 8th Bottom-Nav Tab | sdd-35 | Already REMOVED by sdd-36. **Must not be resurrected** by the rewrite |

### Why `anime-detail` takes no delta

`anime-detail` is a single requirement — "Shared Detail Component Across Catalog and History" —
carried and modified across all three changes. SDD-69 neither replaces it nor re-authors it: it adds
one section. Forcing a full re-statement of a three-generation contract to append a section would
cost more than the change itself, so the per-anime history section is specified as a `watch-history`
requirement about where that read model surfaces.

One existing scenario does break and the `watch-history` spec MUST absorb it: sdd-37's *"Back returns
to the exact History spot"* asserts the back button lands on "the same /history URL (page/search/filters
intact)". Those query params cease to exist. The back button itself — router back, `/history`
fallback — survives.

### Capabilities taking no change

`activity-runtime-events` (its domain filter derives options from the data, spec.md:67-76, so a new
`anime`-domain producer needs no requirement change), `anime-editor` ("History MUST remain a
read-only activity log" becomes literally true), `desktop-navigation` (the nav entry is unchanged).

## Approach

Three tables, three lifetimes: `watch_history` permanent, `activity_log` capped, `runtime_events`
rotating (~140 days). The asymmetry is the point — *you watched episode 9* is kept forever, *a folder
was opened* only until the question it answers goes stale.

**Materialising is required, not an optimisation.** A folded or derived model cannot be keyset-paged,
because deciding whether row N is visible needs lookahead to a later retraction. A materialised table
makes global paging a plain index scan. The insert/delete pair was exercised by replaying 379 real
progress events, which established the model's shape and found 3 retractions below where the log
begins. **That replay's row count and its "zero double inserts" result do not hold** — it filtered
its input by `action_type`, excluding `anime_repeated`, whose diff (`11 → 0`) a naive backward rule
reads as a full retraction. See `explore.md` §4.1 for both flaws and `design.md` D3 for the cycle-
scoped correction. The corrected count is higher and is re-measured during apply, not estimated here.

The recorder is a single derivation function shared by both the live write paths and the backfill, so
the replay cannot disagree with live recording. It is guard-dense (forward/backward/zero-delta,
half-steps, retraction floor), which makes the **MUTATE** step of RED → GREEN → MUTATE → REFACTOR
mandatory on it: `ditto staged` scoped with `--test-command "go test -count=1 -json ./internal/<pkg>/"`.

The backfill mirrors `internal/sync/vocabulary_migration.go` — marker-guarded in
`schema_migration_markers`, idempotent, and preceded by `CreateRestorePoint`
(`internal/sync/restore_point.go:23`). The telemetry relocation also removes a real coupling: today
`RecordActivity` runs synchronously inside the patch and its error propagates, so a failed telemetry
write can fail the user's action. `eventlog.NewQueue` drops on overflow instead.

The new `/history` rail is a long list by definition, and ADR-012's SDD-65 addendum already rules on
exactly this shape — "live lists whose batches come from a cursor-paged server query". It takes the
**live** branch: no `useProgressiveListWindow` (its render-phase reset would snap the user back to the
first batch on every page append), reusing only `isNearListBottom`, with the server page as the batch.
`Table.LoadMore` is forbidden by that addendum's 2026-08-31 correction, and `onScroll` binds to the
wrapping `overflow-y-auto` div, never `Table.ScrollContainer`, which is horizontal-only. The mandatory
DOM-count guard and the three mandatory states (skeleton / `AirisEmptyState` / error `Alert`) as
exclusive branches both still apply.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/watchhistory/` (new) | New | Schema, store (insert, delete-above, keyset page, per-anime), diff-derived recorder |
| `internal/persistence/schema.go` | Modified | Registers the new table's DDL |
| `internal/anime/episode_service.go` | Modified | Records watch history; drops the four navigation action constants |
| `internal/anime/service.go` | Modified | `ListAnimeHistory` removed; new read models |
| `internal/activity/store.go`, `schema.go` | Modified | Retention cap; drops the four navigation action constants |
| `internal/desktop/app_activity_write.go` | Modified | Mobile path records watch history |
| `internal/desktop/app_desktop_actions.go` | Modified | Telemetry to `eventlog`, not `activity_log` |
| `internal/desktop/app_runtime.go` | Modified | Bindings: global page read, per-anime read |
| `internal/api/contracts/contracts.go`, `services.go` | Modified | `AnimeHistoryItem` replaced |
| `internal/sync/` | New | One-shot backfill migration + restore point call |
| `frontend/src/features/history/ui/HistoryTable/` | Removed | Replaced by the timeline surface |
| `frontend/src/features/history/ui/HistoryTimeline/` (new) | New | Day-grouped episode list |
| `frontend/src/features/anime-detail/ui/AnimeDetail/` | Modified | Per-anime history section |
| `frontend/src/infrastructure/bridge-runtime-source/`, `shared/contracts/anime.types.ts` | Modified | Adapter + types |
| `docs/adr/022-*.md` | New | Model, rejected alternatives, three-lifetimes rule |

## Size Forecast

Measured with line counts over this tree, not estimated by eye (CLAUDE.md #22).

| Comparable | Measured (prod / test) |
|---|---|
| `internal/activity` — table + store + tests | 313 (203 / 110) |
| `internal/sync` SDD-56 one-shot migration | 898 (427 / 471) |
| `internal/persistence` schema registry | 357 (142 / 215) |
| `frontend/.../HistoryTable/` — the module being replaced | **1,858** (899 / 959) |
| `AnimeRepetitionTimeline.tsx` + its test | 147 (64 / 83) |
| `internal/desktop/app_desktop_actions.go` | 130 |
| ADR band (`AGENTS.md`) | 123-217 |

Forecast per slice against the **600-line** budget (prod + test + artifact prose):

| # | Slice | Prod | Test | Prose | Total | Fits |
|---|---|---:|---:|---:|---:|---|
| 1 | `watch_history` schema + store | 200 | 330 | 60 | 590 | Yes, tight |
| 2 | Diff-derived recorder on both write paths | 150 | 350 | 60 | 560 | Yes |
| 3 | One-shot backfill + telemetry-row purge | 150 | 300 | 60 | 510 | Yes |
| 4 | Telemetry → `runtime_events`; `activity_log` cap; ADR-023 | 110 | 230 | 240 | 580 | Yes, tight |
| 5 | Wails bindings + frontend adapter + contracts | 120 | 180 | 50 | 350 | Yes |
| 6a | `/history` timeline: grouping helpers + rows | 220 | 320 | 60 | 600 | At the cap |
| 6b | `/history`: three states + progressive window guard | 200 | 250 | 50 | 500 | Yes |
| 7 | Remove the old `HistoryTable` module | 0 | 0 | 40 | **1,898** | **No** |
| 8 | Anime Detail per-anime history section | 180 | 200 | 50 | 430 | Yes |

**≈ 5,620 changed lines across 9 units.** Slice 7 is a measured 1,858-line deletion. The cap counts
insertions *plus* deletions, so a wholesale removal cannot fit and trimming it is meaningless — there
is nothing to refactor in a deletion. `sdd-tasks` must choose between a declared `size:exception` for
a deletion-only unit and splitting the removal by file group (899 production / 959 test). Raising it
now makes it a planning decision instead of an apply-time stop.

Not counted above: `anime-history` needs a **full** capability spec rather than a delta (no parent
exists), which is ~150-250 lines of spec prose against the ~60-90 a delta would cost. That lands in
the spec phase, before slicing, so it does not move any slice's number — but it is real artifact
volume and the three surviving requirements must be transcribed, not summarised.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The backfill deletes 277 rows that turn out to be wanted | Low | Restore point first; the rows have `before == after` and zero production readers; the purge is a separate task from the replay so it can be dropped without losing the replay |
| Replay disagrees with live recording | Med | One derivation function serves both; fixtures built from the real `activity_log` row shape |
| "History starts 2026-07-05" reads as data loss | Med | The surface states the log's start date in its early/empty state |
| `runtime_events` already holds 371 dead `anime`-domain rows | Med | Tracer-bullet residue (null `event_type`, none newer than 2026-08-30); confirm dead before writing real telemetry into that domain |
| Slice 7 exceeds the budget as a pure deletion | High | Declared above; `sdd-tasks` picks exception vs split |
| **Three unarchived changes hold the only copy of the contract SDD-69 replaces** | High | `2026-07-03-sdd-35/36/37` were never archived, so `anime-history` and `anime-detail` have no promoted spec. SDD-69 writes `anime-history` as a full new capability spec and carries the surviving requirements forward explicitly (table above) rather than leaving them to be inferred. Archiving those three is flagged, not done here — doing it inside SDD-69 would merge three unverified change sets under cover of this one |
| The rewrite silently drops a surviving requirement | Med | The supersession table names every requirement and its fate, including the two carried forward verbatim and the one sdd-36 already removed that must not return |
| `watch_history` grows unbounded | Low | Measured: `activity_log` costs 415 B/row across four indexes → 1.4 MB/year; `watch_history` rows are narrower, against a 22.2 MB database |

## Rollback Plan

Slices 1, 2 and 4-8 revert with `git revert`. `watch_history` is a new table with no prior data; an
older build neither reads nor writes it, and a registry-created table left behind is inert.

Slice 3 is the only unit that is not trivially reversible, because it deletes rows. Its reversal has
three parts:

1. **`CreateRestorePoint` (`internal/sync/restore_point.go:23`) MUST run before the migration mutates
   anything.** That is the byte-level undo for the whole database and the only complete one.
2. `watch_history` contents are disposable: drop the table and clear its `schema_migration_markers`
   entry, and the next launch replays from `activity_log`. The migration MUST be idempotent —
   re-running after a partial failure must not double-insert, which the replay already demonstrates
   against real data.
3. The 277 deleted rows are navigation telemetry with identical before/after, no consumer contract,
   and no production reader. Outside the restore point, their loss degrades nothing.

## Dependencies

None external. The `internal/persistence` schema registry, `internal/observability/eventlog`,
`pruneOldestBeyondRetention`, `CreateRestorePoint`, and `isNearListBottom` all ship today.
(`useProgressiveListWindow` also ships, but this rail deliberately does not use it — see Approach.)

## Success Criteria

- [ ] A forward episode step writes exactly one `watch_history` row; a backward step deletes the rows
      above the new value; a zero-delta patch writes nothing — all asserted from the diff, never from
      `action_type`.
- [ ] `SetAnimeDays` writes no `watch_history` row, asserted.
- [ ] Half-steps round-trip (`11 → 10.5 → 11` leaves no residue) and a retraction below the log's
      floor is a no-op, not an error.
- [ ] The backfill is idempotent: replaying the fixture twice yields the same row set.
- [ ] After the backfill, `activity_log` holds zero rows carrying the four navigation action types,
      and new navigation actions land in `runtime_events` under `domain = "anime"`.
- [ ] `activity_log` prunes beyond its cap, following the `pruneOldestBeyondRetention` cadence.
- [ ] `/history` renders day headings with per-day counts, newest first, with exclusive
      skeleton / empty / error states and a DOM-count windowing guard.
- [ ] Anime Detail shows that anime's episode history beside the repetition timeline, and back
      navigation still lands on `/history` without depending on the removed query params.
- [ ] The rewritten `anime-history` spec carries forward "History Is Its Own Top-Level Section" and
      "English UI Copy with Spanish Data Literals Preserved" verbatim, does not resurrect "History
      Reached Without an 8th Bottom-Nav Tab", and states the replacement URL-state contract.
- [ ] `go test ./...`, both golangci profiles, the frontend suite, `checkgofilesize` with an empty
      baseline, and `render:smoke` all pass; `docs/openapi.yaml` has no diff.
