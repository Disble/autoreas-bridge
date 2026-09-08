# Exploration: loading-skeletons

## Current State

HeroUI v3.2.4 ships a single `Skeleton` primitive (`import { Skeleton } from '@heroui/react'`): a bare
`div` rendering a shaped box, taking `className` and `animationType` (`shimmer` | `pulse` | `none`),
plus a `skeleton--shimmer` parent class for a synchronized sweep. It has no built-in text, avatar or
card variants, so every surface composes its own skeleton out of sized boxes.

The codebase is **not** greenfield for this primitive. Nine loading branches already render
`<Skeleton>` directly, with no shared wrapper:

| File | Skeleton shape | A11y on the loading branch |
|---|---|---|
| `features/history/ui/HistoryTable/HistoryTable.tsx:96-102` | label + 5 full-width bars | `aria-live="polite"` wrapper — the only pushed announcement |
| `features/download/ui/SchedulePanel/SchedulePanel.tsx:32-39` | 2 stacked bars | static `aria-label` on the `<section>` |
| `features/download/ui/HosterPriorityEditor/HosterPriorityEditor.tsx:18-26` | 3 stacked bars | static `aria-label` |
| `features/download/ui/RunHistoryPanel/RunHistoryPanel.tsx:17-25` | 3 stacked bars | static `aria-label` |
| `features/download/ui/EpisodeRenamePanel/EpisodeRenamePanel.tsx:13-19` | 1 bar | static `aria-label` |
| `features/download/ui/JDLimitsPanel/JDLimitsPanel.tsx:16-22` | 1 bar | static `aria-label` |
| `features/download/ui/JDConfigPanel/JDConfigPanel.tsx:17-24` | 3 stacked bars | static `aria-label` |
| `features/season/ui/SeasonWorkspace/SeasonWorkspace.tsx:38-44` | one `h-40` bar | static `aria-label` |
| `features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorFormPanel.tsx:28-39` | shape-mirroring: label+input pairs in the real form's grid | none (inline, not a full replace) |

`AnimeEditorFormPanel` is the strongest precedent for "mirror the shape of what is about to arrive".
The other seven are a generic "N stacked bars".

Text-only loading states that remain:

| File | Rendering | Content that replaces it |
|---|---|---|
| `EpisodeSchedulePanel.tsx:66` | `<Typography>` "Loading the schedule..." | grid of `EpisodeScheduleCard` (cover slot + name + status chip + progress text + action buttons) |
| `CatalogPanel.tsx:60-65` | `<Spinner size="sm" />` + `<span>Loading animes...</span>` | `<menu>` of `<li>` rows (name + progress subtitle + up to 2 chips) |
| `AnimeEditorListPanel.tsx:28` | `<Typography>` "Loading anime list..." | scroll rail of `<Button>` rows (name + muted subtitle) |
| `AnimeDetail.tsx:43` | `<p>` whole-component replace | card hero, stat tiles, three `<dl>` sections |
| `SoloAnimeDownloadPanel.tsx:55-60` | `Spinner` + "Loading readiness..." | same rail row shape as the Editor Library |
| `SyncingAnimePanel.tsx:23-28` | `Spinner` + label | 2-col grid of cards |
| `activity-overview.helpers.ts:168`, `network-panel.helpers.ts:462`, `TransactionTable.tsx:67` | text in `Table.Body`'s `renderEmptyState` slot | `Table.Row`s |

The three Activity/Network/Transaction surfaces share a structural quirk: loading and empty text come
from one `isLoading ? LOADING : EMPTY` helper feeding `renderEmptyState`. A skeleton cannot drop into
that slot as text; it needs real skeleton `Table.Row`s and a helper redesign.

## Accessibility: the finding that decides the design

A `Skeleton` is a decorative, unlabeled `div`. Replacing visible text with one **removes** whatever
signal assistive technology had. The three target surfaces are not equal here:

| Surface | Announced today? |
|---|---|
| Today (`EpisodeSchedulePanel`) | **No** — plain flowed text, no live region |
| Editor Library (`AnimeEditorListPanel`) | **No** — plain flowed text |
| Catalog (`CatalogPanel`) | **Yes** — `<Spinner>` ships `role="status"` and `aria-label="Loading"` |

The Spinner behaviour was verified against the installed package rather than assumed:
`frontend/node_modules/@heroui/react/dist/components/spinner/spinner.js:74,76` sets
`"aria-label": "Loading"` and `role: "status"`, with the visual glyph `aria-hidden`. So Catalog is
currently the most accessible of the three, and a naive conversion regresses it outright.

Of the nine existing `<Skeleton>` sites, only `HistoryTable` wraps its skeleton in
`aria-live="polite"`. The other eight rely on a static `aria-label` on a `<section>`, which screen
readers surface on landmark navigation rather than announcing on mount. Copying the majority pattern
would ship the same gap into three more surfaces.

## Existing shared primitives

No shared skeleton component exists under `frontend/src/shared/ui/`. The closest precedent is
`AirisEmptyState` (same three surfaces, from the archived `airis-empty-states` change): a
presentation-only shell where the feature owns classification and copy. It proves the pattern, but its
one-image-one-message shape does not generalise to three structurally different skeleton rows.
`AnimeCoverPlaceholder` is decorative missing-cover art, not a loading indicator.

## Approaches compared

1. **A shared `<LoadingSkeleton variant=...>` in `shared/ui/`.** Rejected. The three surfaces need three
   genuinely different row shapes; a variant prop re-implements per-feature composition behind
   indirection, and contradicts the repo's own precedent — none of the nine existing call sites use a
   shared wrapper, including the most sophisticated one.
2. **Per-feature skeleton components colocated with each panel, composing bare `Skeleton`.**
   Recommended. Matches the existing convention and `AnimeEditorFormPanel`'s shape-mirroring
   precedent, respects colocation and ADR-011 (no barrels), and keeps each skeleton locked to the row
   it mirrors. The repo's own extraction bar is "the same pattern three times"; these are three
   different patterns once.

## Test coverage that this change must rewrite

All three surfaces assert on the literal text being deleted:

- `CatalogPanel.test.tsx:149` — `getByText('Loading animes...')`
- `EpisodeSchedulePanel.test.tsx:278,317` — `findByText`/`queryByText('Loading the schedule...')`
- `AnimeEditorListPanel.test.tsx:114` — `findByText('Loading anime list...')`

These get rewritten under strict TDD rather than deleted. Moving each string from visible text to the
accessible name of a `role="status"` region means the assertions become *stronger*
(`getByRole('status', { name: ... })` proves both presence and announcement), not weaker.

## Recommended scope

Exactly the three surfaces the user named: Today, the Editor Library and Catalog.

- They are the only remaining pure-text loading states among list- and card-shaped surfaces;
  everything else in that group already has a `Skeleton`.
- It is the same three-surface boundary the archived `airis-empty-states` change used on these same
  panels, so the empty and loading states of each surface stay in one story.
- `AnimeDetail`, `SoloAnimeDownloadPanel` and `SyncingAnimePanel` are real gaps but were not asked
  for; deferring them keeps the file and test count bounded.
- `ActivityOverview`, `NetworkPanel` and `TransactionPanel` are deferred out of necessity, not
  discipline: their loading state lives in a `renderEmptyState` slot and needs skeleton `Table.Row`s,
  a separate design decision.

## Risks

1. **Accessibility regression.** Deleting visible text for a decorative box without a replacement
   announcement makes Today and the Editor Library no better and Catalog strictly worse.
2. **Layout shift.** A skeleton whose row height does not match the real row's makes content jump when
   the request resolves — which is the defect skeletons exist to prevent, so a skeleton that causes it
   is worse than the text it replaced.
3. **Three existing tests assert the deleted text** and must be rewritten, not left broken.
4. Skeleton row counts are new conditional logic and need a MUTATE pass per repo policy.
5. Shipping three skeletons beside six remaining text states invites a follow-up; the proposal should
   record the deferrals as deferred, not dropped.

## Ready for Proposal

Yes.
