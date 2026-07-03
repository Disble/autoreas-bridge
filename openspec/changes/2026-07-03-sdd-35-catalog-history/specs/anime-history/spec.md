# Anime History Specification

## Purpose
A workflow-oriented surface, distinct from the raw Catalog inventory, showing per-anime progress
and repetition-timeline context. Read-only, sourced from legacy fields the bridge already
normalizes (plus the newly-typed `repetir` from `anime-detail`) — no new persistence and no new
legacy schema.

## Requirements

### Requirement: History Read Model
The system MUST provide a read-only History list showing, per anime, its progress state (episodes
watched vs. total) and repetition count, reusing existing catalog/list data — no new persistence
or write path.

#### Scenario: History lists animes with progress state
- GIVEN the bridge's catalog contains animes with varying `nrocapvisto`/`totalcap`
- WHEN the History surface renders
- THEN each entry MUST show its progress (watched/total) and repetition count

#### Scenario: History surface is read-only
- GIVEN the History surface
- WHEN a user interacts with any History entry
- THEN no write/patch/reconcile call MUST be triggered by History itself (drill-down to Detail is
  navigation, not a write)

### Requirement: History Reached Without an 8th Bottom-Nav Tab
Since the bottom nav already holds 7 entries, History MUST be reached via drill-down from Anime
Detail and/or a segmented Catalog/History control, NOT via a new top-level bottom-nav tab.

#### Scenario: Bottom nav entry count unchanged
- GIVEN the mobile bottom navigation has 7 entries before this change
- WHEN History is introduced
- THEN the bottom nav MUST still have exactly 7 entries

#### Scenario: History reachable from Catalog context
- GIVEN a user browsing Catalog
- WHEN they use the segmented control or drill into an anime's detail
- THEN they MUST be able to reach the History view for that anime without using the bottom nav

### Requirement: English UI Copy with Spanish Data Literals Preserved
All History UI copy (labels, headers, empty states) MUST be in English. Data literals that mirror
Legacy values (e.g. "Ver hoy"-style data terms, if surfaced) MUST remain in their original Spanish
form since they are data, not chrome.

#### Scenario: History labels render in English
- WHEN the History surface renders
- THEN all UI chrome (headers, section labels, empty-state text) MUST be in English

#### Scenario: Data literals stay Spanish
- GIVEN a data-origin literal reused from Legacy (not UI chrome)
- WHEN it is displayed in History
- THEN it MUST remain in its original Spanish form
