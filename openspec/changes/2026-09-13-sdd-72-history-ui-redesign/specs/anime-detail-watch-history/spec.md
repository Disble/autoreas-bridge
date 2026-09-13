# Anime Detail Watch History Specification

## Purpose

Anime Detail's per-anime history, replacing the separate "Repetition history" and "Episode
history" sections with one Watch history section. It renders the anime -> watch -> episode
hierarchy: a watch is one pass through the series (a repeat closes the current watch and starts
the next), and an episode is one dated, timed entry inside a watch. Watches that closed before the
`watch_history` log began (2026-07-05) render from the anime's repetition record instead of
recorded episodes.

## Requirements

### Requirement: One Watch History Section Replaces Repetition And Episode Histories

Anime Detail MUST render exactly one "Watch history" section per anime. It MUST NOT render a
separate repetition timeline or a separate episode history list.

#### Scenario: The two legacy sections are gone

- GIVEN an anime with recorded repetitions and watch history
- WHEN its Anime Detail view renders
- THEN exactly one "Watch history" section MUST be visible
- AND no "Repetition history" or "Episode history" section MUST render

### Requirement: Watch Number Is Derived From The Stored Cycle

Each recorded episode's watch number MUST equal its stored `cycle`. For an anime whose
repetitions array holds entries `repetitions[0..N-1]`, `repetitions[i]` MUST be presented as watch
`i + 1`, and the anime's current, live watch MUST be presented as watch `N + 1`.

#### Scenario: Two repetitions produce three sequential watches

- GIVEN an anime with two recorded repetitions and episodes recorded under cycle 3
- WHEN its Watch history renders
- THEN it MUST show three watches, numbered 1, 2, and 3
- AND watch 3 MUST be the one carrying the "Current" chip

### Requirement: By Watch Groups Episodes Into One Accordion Item Per Watch

The "By watch" tab MUST be the default tab. It MUST render one Accordion item per watch, ordered
newest first. Each item's heading MUST show the watch number, a "Current" chip only on the live
watch, that watch's status, its date span, an "X of Y episodes" count, and a progress bar. Inside
an item with recorded episodes, each row MUST show "Episode N" and that episode's date and time
together, and this date-time pair MUST repeat on every row even when several rows share a day.

#### Scenario: The current watch shows live progress

- GIVEN an anime on its second watch with 5 of 12 episodes recorded
- WHEN the "By watch" tab renders
- THEN the newest Accordion item MUST show "Watch 2", a "Current" chip, and "5 of 12 episodes"

#### Scenario: Multiple episodes on the same day each keep their date

- GIVEN three episodes recorded on the same calendar day within one watch
- WHEN that watch's Accordion item renders
- THEN each of the three rows MUST display that day's date together with its own time, not a
  shared or blank date cell

### Requirement: A Watch Predating The Log Shows Its Repetition Summary

A watch whose episodes were never recorded in `watch_history` (any repetition that ended before
2026-07-05) MUST render a dashed summary built from its repetition record instead of an episode
list: Started, Premiere, Last watched, and Ended (labelled from the repetition's `deletedAt`).

#### Scenario: A pre-log watch shows dates, not episodes

- GIVEN a repetition that ended in 2021, before watch history recording began
- WHEN its Accordion item renders
- THEN it MUST show the Started, Premiere, Last watched, and Ended dates from that repetition
- AND it MUST NOT render an episode row list for that watch

### Requirement: All Episodes Lists Every Recorded Episode With Its Watch

The "All episodes" tab MUST render every recorded episode for the anime as a flat, newest-first
list, independent of the By-watch grouping. Each row MUST show "Episode N", a "Watch K" chip
naming the cycle it belongs to, and its date and time together.

#### Scenario: Episodes from two watches interleave by date

- GIVEN an anime with recorded episodes in cycle 1 and cycle 2 sharing overlapping dates
- WHEN the "All episodes" tab renders
- THEN rows MUST be ordered by date and time alone, each carrying the "Watch K" chip for its own
  cycle

### Requirement: Long Lists Page Progressively

Both the episode rows inside a By-watch Accordion item and the All-episodes list MUST render an
initial batch and grow it as the user scrolls near the bottom, never mapping a full result set
into the DOM at once.

#### Scenario: An Accordion item's episode list grows on scroll

- GIVEN a watch with more recorded episodes than the initial batch size
- WHEN its Accordion item is expanded
- THEN the DOM row count MUST match the initial batch size
- AND scrolling near the bottom of that item MUST load its next page

### Requirement: Loading, Empty, And Error States Are Exclusive Per Tab

Each tab (By watch, All episodes) MUST render exactly one of a loading skeleton, an explicit empty
state, or an error state at a time. Content MUST NOT render while its tab is loading.

#### Scenario: Switching tabs shows that tab's own state

- GIVEN the All episodes tab's data has not yet loaded
- WHEN the user switches to it
- THEN only its loading skeleton MUST be visible, not stale By-watch content or an empty state

### Requirement: Back Navigation From Anime Detail Falls Back To History

Leaving Anime Detail with the back action MUST use ordinary router back navigation, falling back
to `/history` when there is no prior entry in the navigation stack. What state `/history` shows on
return is governed by `anime-history`'s URL-persisted filter and selection requirement, not by
this requirement.

#### Scenario: Back with no prior entry lands on History

- GIVEN a user who reached Anime Detail without a `/history` entry in their navigation history
- WHEN they trigger the back action
- THEN they MUST land on `/history`

### Requirement: English UI Copy With Spanish Data Literals Preserved

All Watch history UI copy (tab labels, headings, empty and error text) MUST be in English. Status
values and other data-origin literals MUST remain in their original Spanish form.

#### Scenario: Status renders in its original Spanish form

- GIVEN a watch whose current status is a Spanish data literal
- WHEN its Accordion item renders
- THEN that status chip MUST show the literal unchanged, while every surrounding label stays in
  English
