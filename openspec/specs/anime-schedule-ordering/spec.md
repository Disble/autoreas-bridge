# Anime Schedule Ordering Specification

## Purpose

Provide one reusable anime-schedule ordering capability for Season and Anime Editor, with a global active-anime draft and atomic schedule application.

## UI Structure

```text
+--------------------------------------------------------------------------------+
| Anime Schedule                         Origin anime highlighted        [Close]  |
| [Conflict/validation banner when needed]                                       |
+--------------------------------------------------------------------------------+
| Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday           |
|        globally ordered draggable active-anime cards per destination           |
+--------------------------------------------------------------------------------+
| Sin ver                    | Ver hoy                    | Visto                 |
| special ordered queues, part of the same shared draft                          |
+--------------------------------------------------------------------------------+
| Draft summary / validation                         [Reset] [Apply schedule]     |
+--------------------------------------------------------------------------------+
```

## Requirements

### Requirement: Near-full-screen global schedule modal

The system MUST open schedule editing in a near-full-screen modal from Anime Editor. The modal MUST cover all active anime, all weekday destinations, and the special queues `Sin ver`, `Ver hoy`, and `Visto` in one shared draft. The modal MUST highlight the originating anime and SHOULD scroll it into view on open.

#### Scenario: Origin anime stays visible in the shared context

- **GIVEN** the user opens schedule editing from anime A
- **WHEN** the modal appears
- **THEN** anime A is highlighted inside the global board
- **AND** the modal shows all destinations as part of one draft

#### Scenario: Whole-draft actions belong to the modal, not one column

- **GIVEN** the user rearranges anime across multiple destinations
- **WHEN** the modal footer renders
- **THEN** **Reset** and **Apply schedule** operate on the full draft
- **AND** no column acts as an isolated save boundary

### Requirement: Reusable schedule-specific ordering core

The system MUST refactor Season Ordering into a reusable anime-schedule-specific core with separate Season and Anime Editor adapters. Season MUST retain its approved-seasonal-anime eligibility rules. Anime Editor MUST use all active anime and the global destinations above. The abstraction MUST remain schedule-specific and MUST NOT expand into a generic callback-heavy drag board.

#### Scenario: Season keeps its own eligibility rules

- **GIVEN** Season opens the shared ordering capability
- **WHEN** it loads eligible cards
- **THEN** only approved seasonal anime participate
- **AND** Anime Editor rules are not imposed on Season

#### Scenario: Anime Editor uses all active anime

- **GIVEN** Anime Editor opens schedule editing
- **WHEN** the shared ordering capability loads
- **THEN** every active anime can appear in the draft
- **AND** weekday plus special destinations are available

### Requirement: Drag-and-drop stack and UI semantics are fixed constraints

The ordering capability MUST use only `@dnd-kit/react` and `@dnd-kit/helpers`, MUST remain compatible with React 19 StrictMode and Wails WebView2 pointer interactions, and MUST NOT use native HTML5 drag-and-drop or legacy `@dnd-kit/core`, `@dnd-kit/sortable`, or `@dnd-kit/utilities`. The modal UI MUST use semantic HeroUI Modal or Dialog, Alert, Card or Surface, ScrollShadow, and Button primitives with semantic action hierarchy.

#### Scenario: Empty destinations remain reachable through the supported drag stack

- **GIVEN** a destination has no anime assigned
- **WHEN** the user drags an anime into it
- **THEN** the destination accepts the drop within the supported pointer-based interaction model
- **AND** the feature does not require disabling StrictMode

### Requirement: Shared draft validation and reset

The modal MUST maintain one shared draft, MUST show visible validation or conflict feedback, and MUST validate duplicate placement and per-destination ordering constraints before apply. **Reset** MUST discard unsaved schedule edits and restore the authoritative schedule snapshot that opened the modal.

#### Scenario: Duplicate or invalid ordering blocks apply

- **GIVEN** the draft contains an invalid duplicate or position conflict
- **WHEN** the user tries to apply the schedule
- **THEN** the modal shows validation feedback
- **AND** no schedule write begins

#### Scenario: Reset restores the authoritative snapshot

- **GIVEN** the user made unsaved schedule changes
- **WHEN** the user presses **Reset**
- **THEN** the draft returns to the last authoritative schedule state loaded for the modal
- **AND** pending validation feedback is cleared unless the restored state is itself invalid

### Requirement: Create-mode controlled input with draft cards

The ordering core MUST support a create-mode usage where the host supplies
draft anime rows (not yet persisted) alongside existing persisted cards. Each
draft MUST be seeded as a draggable card using a synthetic id (`__draft__:N`)
and MUST start in staging. The board MUST expose destinations for drafts
identical to the destinations it already exposes in edit mode: the seven
weekdays plus the special queues (`Sin ver`, `Ver hoy`, `Visto`). The board
MUST NOT self-persist in create mode; it MUST expose current draft placements
to the host via a read accessor (e.g. `buildAnimeScheduleDraftPlacements`).

#### Scenario: Draft cards start in staging with full destination access

- **GIVEN** the host mounts the board in create mode with 3 draft rows
- **WHEN** the board renders
- **THEN** all 3 drafts appear as staged draggable cards
- **AND** every weekday and special-queue destination is available to drag drafts into

#### Scenario: Host reads current draft placements without a save

- **GIVEN** the user has dragged 2 drafts into weekday destinations
- **WHEN** the host calls the draft placement accessor
- **THEN** it returns the current placement for each draft
- **AND** no persistence write is triggered by the read

### Requirement: Existing cards are drag-locked but reflow on mid-insertion

In create mode, existing persisted cards MUST remain drag-locked (not
draggable by the user) but MUST reflow their order when a draft is inserted
ahead of them in the same destination. Collision-safety (one anime per
destination slot) MUST hold across existing cards and all batch drafts
together.

#### Scenario: Inserting a draft shifts existing cards down

- **GIVEN** a weekday destination has 2 existing locked cards at positions 1 and 2
- **WHEN** the user drags a draft into position 1 of that destination
- **THEN** the draft occupies position 1
- **AND** the two existing cards shift to positions 2 and 3 without becoming draggable

#### Scenario: No collision between drafts and existing cards

- **GIVEN** an existing card occupies a destination slot
- **WHEN** the user drags a draft toward the same slot
- **THEN** the board resolves placement without producing a duplicate-slot state
- **AND** both the draft and the existing card retain distinct positions

### Requirement: Atomic bulk apply with whole-draft conflict rejection

Applying the schedule MUST submit only changed records as one atomic bulk operation. In create mode, "changed records" additionally includes the new draft animes being created and any existing neighbor cards reflowed by mid-insertion; the whole batch (new records plus reflowed neighbors) MUST be written atomically. If any authoritative schedule state changed concurrently for any affected record — new or existing — the system MUST reject the entire batch, MUST perform no partial writes or publications, and MUST reload fresh authority before the user can continue. Successful apply MUST keep the editor and schedule views aligned with refreshed authority.
(Previously: atomic bulk apply covered only edits to existing persisted
anime; create-mode batches with drafts and reflowed neighbors were not
covered.)

#### Scenario: Valid schedule draft applies atomically

- **GIVEN** the shared draft is valid and matches current authority
- **WHEN** the user applies the schedule
- **THEN** only changed records are written as one accepted bulk operation
- **AND** the editor refreshes from the new authoritative schedule state

#### Scenario: One stale record rejects the whole draft

- **GIVEN** the draft spans several anime and one authoritative schedule changed after modal open
- **WHEN** the user applies the schedule
- **THEN** the whole draft is rejected with visible conflict feedback and fresh authority reload
- **AND** no partial append or downstream publication occurs

#### Scenario: Stale existing neighbor rejects a create batch

- **GIVEN** a create batch reflows 2 existing neighbor cards during mid-insertion
- **WHEN** one of those existing neighbors changed authoritatively after the board was seeded
- **THEN** the whole create batch is rejected, including the new draft animes
- **AND** no new anime and no neighbor reflow is partially persisted
