# Delta for Watch History

## Purpose

A permanent, per-episode watch log derived from write-path diffs, replacing the anime-snapshot
projection previously exposed as History. Read by the global `/history` timeline (`anime-history`
capability) and by Anime Detail's Watch history section (`anime-detail-watch-history` capability).
(Previously: named `AnimeRepetitionTimeline` as the per-anime consumer; that component is retired
by this change.)

## MODIFIED Requirements

### Requirement: Read Models Are Keyset-Paged

The global read model MUST page by a keyset on (`watched_at_ms`, `id`), in either newest-first or
oldest-first order, using a comparator mirrored for the requested direction. Before paging, the
global read MUST narrow by an optional name search, an optional watched-range, and an optional
anime-ID set, applied in SQL. The per-anime read model MUST seek an index scoped to that anime,
not scan the global table, and MUST accept an optional cycle to scope the result to one watch.
(Previously: newest-first only, with no search, watched-range, anime-ID, or cycle scoping.)

#### Scenario: Global paging does not require an offset scan

- GIVEN more `watch_history` rows than one page holds
- WHEN the next page is requested with the previous page's keyset cursor
- THEN the result MUST resume immediately after that cursor without re-scanning earlier rows

#### Scenario: Per-anime reads use the anime index

- GIVEN a specific anime with recorded history
- WHEN its per-anime history is requested
- THEN the result MUST be produced by seeking that anime's index entries, not by scanning the
  full `watch_history` table

#### Scenario: Oldest-first paging visits every row exactly once

- GIVEN rows that share the same `watched_at_ms` across a page boundary
- WHEN pages are requested oldest-first across that boundary
- THEN every row MUST appear exactly once, with none skipped or repeated

#### Scenario: Filters narrow the read in both sort orders

- GIVEN a name search, a watched range, and an anime-ID set are all applied
- WHEN the page is requested newest-first and, separately, oldest-first
- THEN both results MUST contain only rows matching all three filters, correctly paged in their
  requested order

#### Scenario: A cycle scope returns only that watch's rows

- GIVEN an anime with recorded rows in cycle 1 and cycle 2
- WHEN its per-anime read is requested with cycle 2
- THEN only cycle 2 rows MUST be returned

## REMOVED Requirements

### Requirement: Per-Anime History Surfaces On Anime Detail

(Reason: this requirement named `AnimeRepetitionTimeline`, which this change retires; Anime
Detail's per-anime presentation is redesigned as one Watch history section.)
(Migration: see the new `anime-detail-watch-history` capability spec.)

### Requirement: Back Navigation From Detail No Longer Restores List State

(Reason: `anime-history`'s new URL-state requirement reverses the "no restore" behavior this
requirement described (Decision a); the underlying router-back mechanism it also described moves
to `anime-detail-watch-history`.)
(Migration: see `anime-history`'s "History State Persists In The URL And Restores On Back" and
`anime-detail-watch-history`'s "Back Navigation From Anime Detail Falls Back To History".)
