# Design: Loading Skeletons

Three feature-owned skeletons, each locked to the row it mirrors, each announced through its own
status region, each measured against the real row it stands in for.

## Technical Approach

Every scoped panel gains a colocated `*Skeleton.tsx` that composes HeroUI's bare `Skeleton` into the
shape of its row, and renders `SKELETON_ROW_COUNT` of them. No shared `shared/ui` component: the three
shapes differ, and none of the nine existing `Skeleton` call sites uses a wrapper.

Each skeleton is wrapped in one status region:

```tsx
<div aria-labelledby="x-loading-label" aria-live="polite" role="status">
  <span className="sr-only" id="x-loading-label">{LOADING_LABEL}</span>
  {rows}
</div>
```

Both halves are load-bearing, for different reasons.

The `sr-only` span carries the wording as real DOM content, which is what a screen reader announces
when the live region appears — an `aria-label` alone names the region but gives a polite live region
nothing to read out, because a decorative `Skeleton` contributes no text.

`aria-labelledby` is what gives the region its accessible name, and it is required rather than
optional: `role="status"` takes its name from the author, not from its contents. The ARIA
name-from-content allowlist does not include `status` (only roles like button, link, heading, cell and
tab qualify), so the content-only version of this snippet computes an accessible name of `""` and
`getByRole('status', { name })` fails against it. That was found by the RED test on Catalog rather
than by review, which is the outcome the test ordering exists to produce.

Ids are static per surface because each panel is single-instance per route. A surface that ever
renders twice on one page must move to `useId`.

## Architecture Decisions

| Decision | Choice and rationale |
|---|---|
| Where skeletons live | Colocated with their panel, composing `Skeleton` directly. Matches `AnimeEditorFormPanel`, the one existing shape-mirroring precedent, and the repo's extraction bar of the same pattern three times — these are three patterns once. |
| Announcement | `role="status"` + `aria-live="polite"` + `sr-only` label per surface. Copies `HistoryTable`, the only existing site with a pushed announcement, rather than the seven `aria-label`-on-a-landmark sites. |
| Catalog's spinner | Removed with the text it labelled. Its `role="status"` is not lost, because the skeleton region supplies one — this is the regression the design exists to prevent, so it is asserted, not assumed. |
| Row extraction | `CatalogListRow` and `AnimeEditorListRow` are extracted from their panels' inline JSX. Without a real row component there is nothing to measure a skeleton against, and the no-layout-shift requirement would degrade into re-asserting a hardcoded number. Today needs no extraction: `EpisodeScheduleCard` is already a component. |
| Shared row geometry | Each feature exports one row-shape class constant used by both the real row and its skeleton, so the two cannot drift apart silently. |

## Data Flow

```text
request unresolved → panel renders <XSkeleton />  → status region + N shape-mirroring rows
request resolved   → panel renders real rows       → status region gone, no skeleton
request failed     → existing error branch         → status region gone, no skeleton
```

Loading precedence is unchanged from `airis-empty-states`: while loading, neither rows nor the Airis
empty state render. This change only replaces what the loading branch itself draws.

## File Changes

| File | Action | Description |
|---|---|---|
| `features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleSkeleton.tsx` | Create | Card-shaped row: cover block, title and chip bars, action-affordance bars |
| `features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel.tsx` | Modify | Loading branch renders the skeleton |
| `features/episodes/ui/EpisodeSchedulePanel/episode-schedule-panel.constants.ts` | Modify | Row count and the shared row-shape class; `EPISODES_LOADING_MESSAGE` becomes the status name |
| `features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListRow.tsx` | Create | The rail row extracted from `AnimeEditorListPanel`'s inline JSX |
| `features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListSkeleton.tsx` | Create | Two-line rail-row skeleton sharing the row-shape class |
| `features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListPanel.tsx` | Modify | Renders the extracted row and the skeleton |
| `features/catalog/ui/CatalogPanel/CatalogListRow.tsx` | Create | The `<li>` row extracted from `CatalogPanel`'s inline JSX |
| `features/catalog/ui/CatalogPanel/CatalogListSkeleton.tsx` | Create | Title, subtitle and chip-pill skeleton sharing the row-shape class |
| `features/catalog/ui/CatalogPanel/CatalogPanel.tsx` | Modify | Renders the extracted row and the skeleton; the spinner and its span go |
| `scripts/layout-fixtures/loading-skeletons-fixture.tsx` | Create | Renders each skeleton row beside its real row and compares heights |
| `scripts/layout-fixtures/main.tsx` | Modify | Registers the new fixture |
| Three existing panel test files | Modify | Text assertions become role-and-name assertions |

## Interfaces / Contracts

```ts
/** How many placeholder rows a surface draws while its request is unresolved. */
export const CATALOG_SKELETON_ROW_COUNT = 4;

/** Shape shared by the real row and its placeholder, so the two cannot drift. */
export const CATALOG_LIST_ROW_CLASS = 'rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4';
```

## Testing Strategy

RED first, for every surface.

Per surface, in jsdom: the loading branch exposes `getByRole('status', { name })`; it renders exactly
`SKELETON_ROW_COUNT` placeholder rows, counted through a `data-testid`; the resolved branch exposes no
status region and no placeholder; the error branch likewise. Catalog additionally asserts that a
`role="status"` region is present while loading — the assertion that would have caught the spinner
regression.

The three existing text assertions are rewritten rather than deleted:
`getByText('Loading animes...')` becomes `getByRole('status', { name: 'Loading animes...' })`, which
proves the wording *and* that it reaches assistive technology.

In headless Edge, the layout fixture renders each skeleton row next to the real row it mirrors, at the
same container width, and fails when their heights differ by more than the stated tolerance. jsdom
cannot do this: it has no layout engine, so a skeleton of the wrong height passes every unit test.

Then the staged mutation pass over the new row-count and branch logic.

## Migration / Rollout

No backend, schema or wire change. Revert is per surface: each skeleton, its row extraction and its
panel branch move together.

## Open Questions

None.
