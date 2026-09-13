# ADR-023: Watch history is one row per episode watched, not one row per log entry

- **Status**: Accepted, implemented
- **Date**: 2026-09-12
- **Supersedes**: nothing
- **Related**: `openspec/changes/2026-09-12-sdd-69-real-watch-history/design.md` (D2, D2a — the
  derivation function this ADR's model authorizes; D3 — the cycle-reset correction referenced
  below; D7, D8 — the telemetry relocation and retention cap this ADR's three-lifetimes rule
  states), `explore.md` §3-5 (the measurements this decision rests on), `openspec/specs/
  observability/spec.md` ("Activity Log Remains Untouched By Runtime-Event Persistence" — amended
  by the same change to allow the retention cap and the departure of navigation telemetry)

## Context

`/history` read `QueryService.ListAnimeHistory`, which emitted one row per anime from the current
snapshot's `LastWatchedAt` — a projection of *now*, not a log of *then*. It could answer "which
animes have I touched" and nothing about what was watched last night. Meanwhile `activity_log` is
a genuine append-only event log — 671 rows spanning 2026-07-05 to 2026-09-11, 69.2 days, 9.7
rows/day — but `Store.ListRecent` had zero production callers: the log existed and nothing read
it. SDD-69 materializes a real history out of that log. This ADR records the row-granularity model
selected for it, the two alternatives measured and rejected, the multi-episode jump rule, a
residue finding that could otherwise be mistaken for a constraint, and the three-lifetimes
retention rule that falls out of separating this new table from the two it used to be entangled
with.

## Decision

### D1 — Selected model: one row per episode watched, with its own timestamp; a rollback deletes the row

The browser-history analogy settles the shape. A browser logs *you visited this page, at this
time*, not *the URL bar changed from A to B*, and a mistaken visit is deleted rather than
annotated. Verified against a real browser history: three visits to the same video one second
apart each keep their own row; repetition surfaces as a count beside the row, never as a collapse
of the timeline.

The model was exercised, not merely reasoned about: replaying 379 real progress events in
timestamp order (forward step inserts, backward step deletes the episodes above the new value)
established the insert/delete shape and found that 3 of 80 rollbacks retract below the log's own
floor — a no-op, not an error, because the episode being un-watched was never recorded to begin
with. That replay's total row count and its "zero double inserts" result are **not** carried
forward as evidence: the replay filtered its input by `action_type` and so never exercised a cycle
reset, which a naive backward rule reads as "retract everything," erasing a repeat's prior watches
outright. `design.md` D3 carries the correction (a `cycle` column, retraction scoped to `(anime_id, cycle)`);
this ADR records only what the replay legitimately demonstrated — the insert/delete shape itself,
the unmatched-retraction behavior, and the log's start date.

### D2 — Rejected: one entry per log row

Measured on the worst single anime-day in the log, Tengen Toppa Gurren Lagann logged 28 raw rows
to net 2 episodes watched, with 13 of those rows being rollbacks — a 14-to-1 noise ratio if every
row became a history entry. The per-anime version is the Dr. Stone sequence
(`xuVLJInv8S1CA8nO`): 13 consecutive progress-log rows (an oscillation between 11 and 10.5, then
between 11 and 12, then a half-step retraction and re-advance) collapse under the selected model to
one net new history row, episode 12. One-entry-per-log-row would have written thirteen for the same
outcome — the same category error as the navigation telemetry this change also removes from
`activity_log`.

| Option | Measured cost | Decision |
|---|---|---|
| One history row per log row | 28 rows / 2 net episodes on the worst day; 13 rows / 1 net row for Dr. Stone | Rejected |
| One row per episode watched (selected) | 1 net row per episode, independent of how many times progress oscillated to reach it | **Selected** |

### D3 — Rejected: fold each day into a digest

A digest entry ("watched episodes 37-39") fixes the noise the same way D2's alternative does not,
but by destroying what a history is for: it holds one timestamp across several episodes, so it
cannot answer "what was the last thing I watched before bed" — the digest has no per-episode time
to point to. The selected model keeps that question answerable because every episode carries its
own row, even when several rows share a timestamp (D4).

### D4 — A multi-episode jump enumerates, and the shared timestamp is a claim about when, not how many times

A jump arrives through exactly one door, and the door is verified rather than assumed. Desktop
cannot jump: `episode_service.go:199` gates every adjustment through `isAllowedEpisodeDelta`, four
equality comparisons against `±1` and `±0.5` (`episode_service.go:304-306`), making a
multi-episode step structurally impossible from the desktop UI. Mobile can: `AnimePatch.
NroCapVisto` is an absolute `*float64` (`contracts/services.go:15`) assigned without delta
validation (`anime_handler.go:234`).

The selected rule enumerates the interval rather than recording only the landing episode: `2 → 5`
records episodes 3, 4 and 5; `10.5 → 13` records the integers 11, 12 and 13 (never the fractional
11.5 or 12.5). The rows share one observed timestamp. That timestamp asserts *when the change was
observed*, not three separate watch instants — a mobile absolute write is more plausibly a state
sync than three deliberate presses, and the design records that ambiguity rather than resolving it.
The alternative, recording only the landing episode, was rejected because it lets the projection
drift permanently from its authority: record `5` after `2 → 5`, roll back to 4, and episodes 3 and
4 never appear anywhere while progress still says 4 — a drift that cannot be repaired because the
intervening episodes were never written.

### D5 — The `anime` domain in `runtime_events` only looked occupied

Relocating navigation telemetry (folder/page opens and copies) out of `activity_log` and into
`runtime_events` under `domain = "anime"` required confirming that domain was actually free, not
assuming it. It was not empty: 371 pre-existing rows already carried that domain. Queried rather
than treated as a blocker, all 371 turned out to share one message shape, carry no `event_type`,
carry no `correlation_id` or `entity_id`, and none is newer than 2026-08-30 — residue from a
tracer-bullet defect (`internal/tracerbullet/runner.go:10-19`) that derived its domain by splitting
its own sentence, already fixed. They are left in place rather than migrated or purged: they are
inert, an external process reads this table, and a non-null `event_type` cheaply separates every
real navigation row from the residue for any future reader. A constraint attributed to existing
data was a hypothesis until queried.

### D6 — Three tables, three lifetimes

| Table | Holds | Lifetime |
|---|---|---|
| `watch_history` | one row per episode watched | permanent |
| `activity_log` | state diffs with source and correlation | capped at 5,000 rows |
| `runtime_events` | diagnostics, including navigation telemetry | rotating, ~140 days |

The asymmetry is the point: *you watched episode 9* is kept forever, while *a folder was opened* is
kept only until the question it answers goes stale. `runtime_events` already rotates on a
measured cadence — 142.7 rows/day against its existing 20,000-row cap — so adding roughly 4.0
rows/day of relocated telemetry narrows that window from about 140 to about 136 days, not enough to
matter. `activity_log`'s new 5,000-row cap follows from its own reduced write rate after telemetry
leaves it (9.7 rows/day total, minus the relocated 4.0, leaving 5.7 rows/day), yielding roughly 877
days, about 2.4 years, of audit trail — the same cap syncdiag already uses elsewhere in this
codebase. Storage was checked and is not the constraint: `activity_log` measured 415 bytes/row
across its four indexes, projecting to 1.4 MB/year against a database that already weighs 22.2 MB.
`watch_history` rows are narrower and carry two indexes instead of four, so a permanent-retention
table costs less per row than the capped one beside it.

## Consequences

- `ListAnimeHistory` and its snapshot-projection read model are removed; `/history` and the
  per-anime detail view read `watch_history` instead, ordered by the episode's own timestamp rather
  than the anime's last-touched time.
- History cannot precede 2026-07-05, where `activity_log` begins. An anime already at episode 39
  when the log starts at 30 shows only episodes 30-39; the surface must state this rather than
  imply completeness.
- A rollback is a real deletion, not an annotation, and it is idempotent because it targets the
  facts a diff produces rather than the log rows that produced them: replaying the same diff twice
  converges rather than duplicating.
- One derivation function serves both live recording and the one-shot backfill that replays
  `activity_log` into `watch_history`, so a replay cannot disagree with live recording by
  construction — this is what makes the D1 replay measurement trustworthy for the properties it
  does claim, and exactly why its cycle-blind row count is explicitly disclaimed rather than reused.
- Navigation telemetry moving to `runtime_events` under `domain = "anime"` shares that domain with
  371 inert legacy rows; any future reader distinguishing real events from residue filters on a
  non-null `event_type`, which the residue never carries.
- `activity_log` gains its first retention cap; every other capped bridge table already uses this
  pattern, and `activity_log` was previously the one exception.

## Alternatives considered

**One entry per log row.** Rejected in D2: measured 28 raw rows for 2 net episodes on the worst
observed anime-day, and 13 raw rows collapsing to 1 net row in the Dr. Stone sequence — the same
category error as the navigation telemetry this change removes from the same table.

**A daily digest entry per anime.** Rejected in D3: removes the noise by removing the very thing a
history exists to answer — which episode was watched at which moment — collapsing several episodes
under one timestamp with no way to recover per-episode ordering.

**Recording only the landing episode on a multi-episode jump.** Rejected in D4: leaves any
intervening episode permanently unrecorded and unrecoverable the moment a rollback crosses it,
which is a worse failure than an approximate shared timestamp on episodes that were genuinely
reached.
