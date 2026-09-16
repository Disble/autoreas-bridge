# Watch History Specification

## Purpose

A permanent, per-episode watch log derived from write-path diffs, replacing the anime-snapshot
projection previously exposed as History. Read by the global `/history` timeline
(`anime-history` capability) and by Anime Detail's per-anime section beside
`AnimeRepetitionTimeline`.

## Requirements

### Requirement: Recording Is Diff-Derived, Never `action_type`-Derived

The recorder MUST determine a watch fact by comparing an anime's episode value before and after a
write, never by branching on the write's recorded `action_type`. `action_type` MAY remain
informational elsewhere, but MUST NOT gate whether or what `watch_history` records.

#### Scenario: A mislabeled write still records the correct fact

- GIVEN a write whose `action_type` label does not match the field that actually changed
- WHEN the recorder processes the before/after pair
- THEN it MUST record (or skip) based on the episode delta alone, independent of the label

### Requirement: A Forward Step Inserts One Row Per Newly Reached Episode

When an anime's episode value increases, the system MUST insert one `watch_history` row per
newly reached episode number, each with its own timestamp.

#### Scenario: A single-episode forward step

- GIVEN an anime at episode 10
- WHEN a write advances it to episode 11
- THEN exactly one `watch_history` row MUST be inserted, for episode 11
- (No forward step larger than +1.0 episode exists in 69 days of real activity, so a single-row
  insert is the only observed and required shape)

### Requirement: A Backward Step Retracts Every Recorded Episode Above The New Value

When an anime's episode value decreases, the system MUST delete every `watch_history` row for
that anime whose episode number is greater than the new value.

#### Scenario: A rollback removes the episodes it retracts

- GIVEN recorded rows for episodes 9, 10, and 11
- WHEN a write moves the anime's episode value back to 9
- THEN the rows for episodes 10 and 11 MUST be deleted
- AND the row for episode 9 MUST remain

### Requirement: A Zero-Delta Write Records Nothing

A write whose before and after episode values are equal MUST NOT insert or delete any
`watch_history` row.

#### Scenario: A same-value patch is a no-op for history

- GIVEN an anime whose episode value is 5 before and after a write
- WHEN the recorder processes it
- THEN no `watch_history` row MUST be inserted or deleted

### Requirement: Fractional Progress Is Accepted But Only Whole Episodes Are Recorded

The recorder MUST accept fractional episode values as input and MUST record only whole episodes:
a forward step records the integers in the half-open interval (`floor(before)`, `after`]. Half of
an episode is not an episode watched, so it enters history only when the episode is finished. The
stored episode column is therefore an integer, and MUST NOT receive a fractional value.

#### Scenario: A half-step forward records nothing

- GIVEN an anime at episode 11
- WHEN it progresses to 11.5
- THEN no `watch_history` row MUST be inserted

#### Scenario: Finishing the episode records it once

- GIVEN an anime at episode 10.5
- WHEN it progresses to 11
- THEN exactly one row MUST be inserted, for episode 11

#### Scenario: An oscillation leaves the same set of episodes, re-timed

- GIVEN an anime that progresses 11 → 10.5 → 11
- WHEN each step is recorded in order
- THEN the final set of (`anime_id`, `cycle`, `episode`) rows MUST be identical to the set before
  the oscillation began
- AND the re-reached episode MUST carry the time it was re-reached, not its original time, since
  the retraction deleted the original row and the re-reach inserted a new one

### Requirement: A Retraction Below The Log's Floor Is A No-Op

Deleting rows for a backward step MUST succeed even when no `watch_history` row exists above the
new value; this MUST NOT raise an error.

#### Scenario: Rolling back past where recording began

- GIVEN an anime with no `watch_history` row recorded at or above its current episode value
- WHEN a write moves its episode value backward
- THEN the operation MUST complete without error
- AND no row MUST be deleted or inserted
- (3 such floor retractions exist in 69 days of real activity, all below where recording begins)

### Requirement: An Episode Is Never Recorded Twice Within A Cycle

`watch_history` MUST enforce a unique index on (`anime_id`, `cycle`, `episode`): within one watch
cycle the same episode MUST NOT be recorded twice. A new cycle MUST be able to record its own copy
of every episode, because a rewatch is the only way this data model can express watching an episode
again — progress is a single number, so re-reaching an episode inside one cycle is only reachable
through a retraction that already deleted the row.

A conflicting insert MUST be a no-op rather than an error, and MUST be counted and warn-logged
rather than silently swallowed: on a live write a conflict is unreachable by the argument above, so
one occurring means a retraction failed to remove a row it should have.

#### Scenario: Re-reaching an episode inside one cycle does not duplicate it

- GIVEN a `watch_history` row already exists for an anime at cycle 2, episode 8
- WHEN a write causes the recorder to consider episode 8 again for that anime in cycle 2
- THEN the insert MUST be a no-op
- AND exactly one row for that (`anime_id`, `cycle`, `episode`) triple MUST exist afterward
- AND the conflict MUST be counted and logged at warn level

#### Scenario: A new cycle records its own copy of an episode

- GIVEN an anime with a recorded row for cycle 1, episode 1
- WHEN the anime is repeated and its first episode is watched again in cycle 2
- THEN a second row MUST be created for cycle 2, episode 1
- AND the cycle 1 row MUST remain untouched

### Requirement: A Cycle Reset Records Nothing And Retracts Nothing

A repeat resets an anime's progress to zero, so the diff a reset produces (for example `11 → 0`)
is indistinguishable from a large rollback by magnitude alone. The recorder MUST treat a cycle
reset as recording nothing and retracting nothing: the episodes watched in the closing cycle were
still watched, and MUST remain in history under that cycle.

#### Scenario: A repeat does not erase the cycle it closes

- GIVEN an anime at episode 11 in cycle 1 with eleven recorded rows
- WHEN it is repeated, producing a diff from 11 to 0
- THEN no `watch_history` row MUST be deleted
- AND no `watch_history` row MUST be inserted
- AND the eleven cycle 1 rows MUST remain readable

### Requirement: Retraction Is Scoped To One Cycle

A backward step MUST delete only rows belonging to the anime's current cycle. Rows recorded under
an earlier cycle MUST NOT be affected by a rollback in a later one.

#### Scenario: A rollback leaves earlier cycles intact

- GIVEN an anime with recorded rows in cycle 1 and cycle 2
- WHEN a backward step occurs while the anime is in cycle 2
- THEN only cycle 2 rows above the new value MUST be deleted
- AND every cycle 1 row MUST remain

### Requirement: The Backfill Anchors Cycles To The Current Repetition Count

The backfill MUST NOT number cycles by counting resets forward from the start of the audit log,
because the log covers only the most recent part of an anime's life: measured on real data, 61
animes carry 68 repetitions in total while the log holds only 2 resets, and 59 of those 61 animes
have more repetitions than the log records. Numbering forward would assign a cycle the live path
never produces, so retraction would silently match nothing.

The backfill MUST instead anchor backwards from the anime's current repetition count `R`, so that
for any replay point `P`, `cycle(P) = max(1, R + 1 - resetsStrictlyAfter(P))`. The final segment
MUST therefore land on `R + 1`, which is exactly what the live path computes.

`K <= R` (logged resets never exceed recorded repetitions) holds because the log is a suffix of an
anime's life. The clamp MUST be applied per row rather than to the starting value, so that the
final segment lands on `R + 1` unconditionally.

#### Scenario: An anime repeated before the log begins still aligns with live recording

- GIVEN an anime with 3 recorded repetitions and no reset in the audit log
- WHEN the backfill replays its episodes
- THEN every replayed row MUST be assigned cycle 4
- AND a subsequent live write MUST compute the same cycle 4

#### Scenario: Unreconstructable early cycles collapse into cycle 1

- GIVEN an anime whose logged resets exceed its recorded repetitions
- WHEN the backfill replays it
- THEN the clamp MUST place the unreconstructable early rows in cycle 1
- AND any resulting key collision MUST be counted and warn-logged with the anime, `R` and `K`

### Requirement: `SetAnimeDays` Records Nothing

Changing an anime's scheduled watch days MUST NOT write any `watch_history` row, forward or
backward.

#### Scenario: A schedule-only change leaves history untouched

- GIVEN an anime with an established watch history
- WHEN its scheduled days are changed via `SetAnimeDays`
- THEN no `watch_history` row MUST be inserted or deleted as a result

### Requirement: The Anime Name Is Denormalized At Record Time

Each `watch_history` row MUST store the anime's name as of the moment it is recorded, independent
of the anime's current name or continued existence.

#### Scenario: History survives a rename

- GIVEN a `watch_history` row recorded under an anime's original name
- WHEN the anime is later renamed
- THEN the row MUST continue to display its originally recorded name, not the current one

#### Scenario: History survives a delete

- GIVEN a `watch_history` row recorded for an anime
- WHEN that anime is later deleted
- THEN the row MUST remain readable with its recorded name intact

### Requirement: Read Models Are Keyset-Paged

The global read model MUST page by a keyset on (`watched_at_ms`, `id`), newest first. The
per-anime read model MUST seek an index scoped to that anime, not scan the global table.

#### Scenario: Global paging does not require an offset scan

- GIVEN more `watch_history` rows than one page holds
- WHEN the next page is requested with the previous page's keyset cursor
- THEN the result MUST resume immediately after that cursor without re-scanning earlier rows

#### Scenario: Per-anime reads use the anime index

- GIVEN a specific anime with recorded history
- WHEN its per-anime history is requested
- THEN the result MUST be produced by seeking that anime's index entries, not by scanning the
  full `watch_history` table

### Requirement: Per-Anime History Surfaces On Anime Detail

Anime Detail MUST present that anime's episode history, sourced from the per-anime read model,
positioned beside `AnimeRepetitionTimeline`.

#### Scenario: Detail shows the anime's own episode history

- GIVEN an anime with recorded `watch_history` rows
- WHEN its Anime Detail view renders
- THEN a section listing its episode history MUST be visible beside the repetition timeline

### Requirement: Back Navigation From Detail No Longer Restores List State

Returning from Anime Detail to History MUST use ordinary router back navigation, falling back to
`/history` when there is no prior history entry in the navigation stack. Because History no
longer encodes page, search, sort, or filter state in its URL, back navigation MUST NOT attempt to
restore any such state.
(Supersedes sdd-37's "Back returns to the exact History spot": the page/search/filter state it
restored no longer exists.)

#### Scenario: Back from detail returns to History

- GIVEN a user who reached Anime Detail from `/history`
- WHEN they press the back button
- THEN they MUST return to `/history`
- AND no page, search, filter, or sort state MUST be restored, since History carries none

#### Scenario: Back falls back to /history with no prior entry

- GIVEN a user who reached Anime Detail without a `/history` entry in their navigation history
- WHEN they press the back button
- THEN they MUST land on `/history`

### Requirement: Retention Is Permanent

`watch_history` MUST NOT be subject to any pruning, capping, or time-based deletion policy; rows
persist indefinitely once recorded (retraction per the rules above is the only removal path).

#### Scenario: No retention job touches watch_history

- GIVEN a running bridge instance with retention jobs configured for other tables
- WHEN those jobs run
- THEN no `watch_history` row MUST be deleted by any retention or pruning process

### Requirement: The Backfill Is Marker-Guarded And Idempotent

A one-shot migration MUST replay `activity_log` into `watch_history` exactly once, guarded by a
`schema_migration_markers` entry, and replaying it again MUST be a safe no-op.

#### Scenario: Replaying the backfill twice yields the same rows

- GIVEN the backfill has already run once and its marker is set
- WHEN the migration path runs again
- THEN it MUST NOT re-run the replay
- AND the resulting `watch_history` row set MUST be identical to the first run's result

### Requirement: The Backfill Creates A Restore Point Before Mutating

The backfill MUST create a database restore point before it inserts or deletes any row.

#### Scenario: A restore point precedes the replay

- GIVEN the backfill is about to run for the first time
- WHEN it begins
- THEN a restore point MUST be created before any `watch_history` insert or `activity_log` delete
  occurs
