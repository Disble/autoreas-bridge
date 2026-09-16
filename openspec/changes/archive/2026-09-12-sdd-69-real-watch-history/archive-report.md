# Archive Report: 2026-09-12-sdd-69-real-watch-history

**Archived**: 2026-09-13
**Change**: Real Watch History
**Status**: Complete and verified (PASS WITH WARNINGS)
**Mode**: openspec

## Summary

History stopped being a projection of each anime's current snapshot. Every progress write on the desktop and
mobile paths now records one `watch_history` row per episode reached, derived from the before/after diff and
scoped to a rewatch cycle. The table was backfilled once from `activity_log` at bootstrap, behind a restore point.
The data surfaces in a day-grouped `/history` timeline and a per-anime section on Anime Detail. Navigation
telemetry moved from `activity_log` to the existing runtime-event log, and `activity_log` gained a 5,000-row cap.
The model is recorded in `docs/adr/023-watch-history-model.md`.

Evidence lives in `verify-report.md`, which this report points at rather than restates.

## Specs synced

| Spec | Action | Details |
|---|---|---|
| `watch-history` | Created | 18 requirements: diff-derived recording, forward, backward and zero-delta steps, fractional progress, per-cycle uniqueness and retraction, cycle resets, backfill cycle anchoring, marker guard, restore point, recorded names, keyset paging, per-anime surface, back navigation, permanent retention |
| `anime-history` | Created | 8 requirements for the `/history` surface: day grouping, whole-row drill-down, exclusive states, progressive rendering, no query state, timestamps, top-level section, English copy |
| `observability` | Modified | "Activity Log Remains Untouched By Runtime-Event Persistence" landed over the original requirement: navigation telemetry goes to the runtime-event log under `domain = "anime"`, `activity_log` is capped, two scenarios added and the original one narrowed to non-navigation actions |

## Delivery

Nine planned slices ran as eleven work units (4 split into 4a/4b, 6 and 7 regrouped into 6a/6b/7) plus a
verification commit that closed three test gaps. Mutation ran after each commit in a separate worktree.

## Warnings carried forward

1. The frontend `test:mutation:staged` job measured nothing on this change's commits; Stryker was run by hand.
   The root cause is unknown.
2. Five work units exceeded the 600-line cap. Four were reset under the owner's standing authorization after a
   measured refactor; slice 7 was the declared deletion exception.
3. The History empty states reuse the Today Airis artwork until a `history.webp` asset exists.
