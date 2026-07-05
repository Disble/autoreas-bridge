# Spec — Chapters Schedule UI

## ADDED Requirements

### Requirement: Every row card carries a cover slot with a stable-size placeholder default
Each chapter-schedule row card SHALL render a cover slot: the shared cover placeholder when no
cover resolves, and the real resolved cover image when one is available. The placeholder and the
real cover SHALL occupy the same layout footprint so resolving a cover never shifts surrounding
content.

#### Scenario: Placeholder shown while no cover is resolved
- GIVEN a chapter-schedule row for an anime with no cover (the overwhelmingly common case)
- WHEN the row card renders
- THEN the shared cover placeholder SHALL be visible in the cover slot

#### Scenario: Real cover shown when resolved
- GIVEN a chapter-schedule row for an anime whose cover resolves successfully
- WHEN the row card renders
- THEN the resolved cover image SHALL be visible in the cover slot instead of the placeholder

#### Scenario: No layout shift between placeholder and real cover
- GIVEN a row card that starts with the placeholder and then receives a resolved cover
- WHEN the cover slot updates from placeholder to real image
- THEN the card's dimensions and surrounding layout SHALL NOT shift or reflow

### Requirement: Hovering the watched count swaps to remaining, without truncating fractional progress
The watched-count text SHALL swap, on hover, to a "N remaining" readout using the same
non-truncated remaining-chapters value in both directions (hover-in and hover-out). This MUST
NOT reproduce Legacy's bug where the hover-in path truncates fractional/half-chapter progress
(`parseInt`) while hover-out does not.

#### Scenario: Hover swaps watched to remaining
- GIVEN a row showing "3 watched"
- WHEN the user hovers over the watched-count text
- THEN it SHALL swap to show "N remaining", where N is the existing non-truncated remaining
  computation already used elsewhere in the row

#### Scenario: Hover-out restores the watched count
- GIVEN a row currently showing the hover-swapped "remaining" text
- WHEN the user stops hovering
- THEN it SHALL revert to showing the watched count

#### Scenario: Half-chapter progress is not truncated in either direction
- GIVEN a row with fractional progress (e.g. 3.5 watched of 10 total)
- WHEN the user hovers over the watched-count text
- THEN the remaining value SHALL be 6.5, not truncated to 6 or 7
- AND hovering out SHALL restore "3.5 watched" using the same non-truncated value

### Requirement: Minus is a danger-colored action; plus remains primary
The decrement ("minus") button SHALL use the `danger` semantic color instead of the neutral
`tertiary` treatment. The increment ("plus") button SHALL remain the primary/constructive
action. Together, the plus/minus pair SHALL be visually dominant on the card relative to the
tertiary icon-only actions (folder, page, status).

#### Scenario: Minus button renders with danger semantic color
- GIVEN a chapter-schedule row card
- WHEN it renders
- THEN the minus (decrement) button SHALL use the `danger` HeroUI semantic color

#### Scenario: Plus button remains primary
- GIVEN a chapter-schedule row card
- WHEN it renders
- THEN the plus (increment) button SHALL use the `primary` HeroUI semantic color

#### Scenario: Plus/minus dominate over tertiary actions
- GIVEN a chapter-schedule row card with folder, page, and status actions alongside plus/minus
- WHEN the card renders
- THEN the folder, page, and status actions SHALL use a visually recessive (tertiary/secondary)
  treatment distinct from the danger/primary plus-minus pair

### Requirement: Folder and page action tooltips show the real path or URL string
The folder and page icon-only action tooltips SHALL display the literal `carpeta`/`pagina`
string for that anime, replacing the current generic aria-label-only tooltip.

#### Scenario: Folder tooltip shows the real path
- GIVEN a row for an anime with a non-empty `carpeta`
- WHEN the user hovers or focuses the folder action
- THEN the tooltip SHALL display the literal folder path string

#### Scenario: Page tooltip shows the real URL
- GIVEN a row for an anime with a non-empty `pagina`
- WHEN the user hovers or focuses the page action
- THEN the tooltip SHALL display the literal page URL string

#### Scenario: Actions stay hidden when the underlying value is absent
- GIVEN a row for an anime with no folder or no page value
- WHEN the row renders
- THEN the corresponding action SHALL remain hidden, exactly as it does today (presence is
  now derived from the literal string being non-empty; the visible gating behavior is
  unchanged)

### Requirement: Day ToggleButtons show a count badge of active, unresolved-progress animes
Each day `ToggleButton` SHALL show a badge counting the entries scheduled on that day with
`estado > 0` and active-or-no-active-flag (mirroring Legacy's `buscarMedalla` semantics, backed
by the new day-count aggregate). A day with a count of 0 SHALL show no badge at all (not a "0"
badge).

#### Scenario: Day with qualifying entries shows a count badge
- GIVEN "Lunes" has 2 entries with `estado > 0`
- WHEN the day ToggleButtonGroup renders
- THEN the "Lunes" ToggleButton SHALL show a badge with the count 2

#### Scenario: Day with zero qualifying entries shows no badge
- GIVEN "Martes" has 0 entries with `estado > 0`
- WHEN the day ToggleButtonGroup renders
- THEN the "Martes" ToggleButton SHALL show no badge (not a badge reading "0")

### Requirement: A single shared cover placeholder is used by both Anime Detail and Chapters
The cover placeholder illustration SHALL be a single shared component, promoted out of its
current anime-detail-only scope, consumed by both the Anime Detail feature and the Chapters
feature. Anime Detail's existing placeholder behavior SHALL remain unchanged after the
promotion.

#### Scenario: Chapters consumes the shared placeholder
- GIVEN a chapter-schedule row with no resolved cover
- WHEN the row renders
- THEN it SHALL render the same shared placeholder component used by Anime Detail

#### Scenario: Anime Detail placeholder behavior is unchanged after promotion
- GIVEN an anime detail view with no resolved cover (or a failing cover image)
- WHEN the hero renders after the placeholder is promoted to a shared location
- THEN the placeholder SHALL still render exactly as it did before the promotion, with no
  visible regression

### Requirement: All new or changed Chapters UI copy is in English
Every string introduced or modified by this change in the Chapters feature (tooltips, badges,
labels) SHALL be in English, consistent with the project's UI-copy convention. This applies to
UI copy only — Legacy data literals (e.g. Spanish weekday names, `estado` labels sourced from
data) are unaffected.
