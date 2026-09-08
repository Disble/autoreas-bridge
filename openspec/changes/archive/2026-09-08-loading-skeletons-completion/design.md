# Design: Loading Skeletons Completion

One shared component for the placeholder shape that repeats, feature-owned placeholders for the shapes
that do not, skeleton rows for the tables, and a skill rule so the next surface starts correct.

## Technical Approach

### The status region, unchanged

```tsx
<div aria-labelledby="x-loading-label" aria-live="polite" role="status">
  <span className="sr-only" id="x-loading-label">{LABEL}</span>
  {placeholder}
</div>
```

`aria-labelledby` is required, not decorative: `role="status"` takes its accessible name from the
author, and ARIA's name-from-content allowlist excludes it, so a region named only by its contents
computes `""`. The `sr-only` span is what a polite live region actually announces, since a `Skeleton`
contributes no text.

**Correction applied during implementation.** The three original surfaces use a static id because each
panel is single-instance per route. `LoadingBars` cannot: six of its eight adopters render together on
`DownloadsRoute`, and `aria-labelledby` resolves through `getElementById`, so duplicate ids would name
every region after whichever span the browser found first — silently, with only one region keeping a
correct name. It uses React's `useId()`, and a test asserts that two co-rendered instances keep their
own names. The rule generalises: a static id is acceptable only where the surface cannot render twice
on one page; a shared component can never assume that.

### `shared/ui/LoadingBars/`

Seven download and season panels render the same markup — a `<section aria-label="Loading X">`
holding one to three `h-10 w-full rounded-lg` bars separated by `mt-2`. They become one component:

```tsx
<LoadingBars className={className} count={3} label="Loading hoster priority" />
```

It owns the status region, so no adopting surface can render bars silently. That is the point of
putting it here rather than leaving seven copies: the gap was identical seven times because the markup
was.

This does not contradict the previous change's refusal to share a skeleton component. That refusal was
about three surfaces whose row shapes differ; these seven are the same markup with a different count.

`HistoryTable` adopts it too. Its label is currently visible, and moving it into the status region
makes it consistent with every other surface — the skeleton is the visual signal, the text is the
accessible one.

### Skeleton table rows

`NetworkTable`, `TransactionTable` and both `ActivityOverview` tables currently put loading text in
`Table.Body`'s `renderEmptyState`. They instead render placeholder rows as `Table.Body` children:

```tsx
<Table.Body renderEmptyState={() => <span …>{emptyMessage}</span>}>
  {isLoading ? placeholderRows : rows.map(…)}
</Table.Body>
```

Rows rather than a pre-table branch, deliberately. `HistoryTable`'s existing branch replaces the whole
table and loses the header, so the columns appear and resize when data lands. Rows keep the header and
the column widths and swap in place, which is the no-layout-shift promise the previous change made.

Because a `role="status"` region cannot nest inside table markup, each table places a visually hidden
status region as a sibling and sets `aria-busy` on the table while loading.

### Group A shapes

| Surface | Resolved content | Placeholder |
|---|---|---|
| `AnimeDetail` | back button, card hero, stat tiles, three `<dl>` sections | one composition: a hero block with avatar circle and two lines, a tile row, and three stacked field groups |
| `SoloAnimeDownloadPanel` | a single-line row: name on the left, status tag on the right, inside one `Button` | mirrors that single-line row |
| `SyncingAnimePanel` | 2-col grid of cards (title, progress, two chips) | the same grid with card-shaped placeholders |

## File Changes

| File | Action | Description |
|---|---|---|
| `shared/ui/LoadingBars/{LoadingBars.tsx,loading-bars.types.ts,__tests__/}` | Create | Shared bar placeholder owning the status region |
| 7 download/season panels | Modify | Adopt `LoadingBars`, drop the hand-rolled bars and the `aria-label`-only section |
| `features/history/ui/HistoryTable/HistoryTable.tsx` | Modify | Adopt `LoadingBars`; the visible label becomes the region's name |
| `features/anime-detail/ui/AnimeDetail/AnimeDetailSkeleton.tsx` | Create | Composition-shaped placeholder |
| `features/download/ui/SoloAnimeDownloadPanel/SoloAnimeDownloadSkeleton.tsx` | Create | Rail-row placeholder |
| `features/dashboard/ui/SyncingAnimePanel/SyncingAnimeSkeleton.tsx` | Create | Card-grid placeholder |
| `features/network/ui/{NetworkTable,TransactionTable}/*.tsx` | Modify | Skeleton rows, `aria-busy`, adjacent status region |
| `features/network/ui/ActivityOverview/ActivityOverview.tsx` | Modify | Same, for both tables |
| `features/network/ui/{NetworkPanel,ActivityOverview}/*.helpers.ts` | Modify | The `isLoading ? LOADING : EMPTY` helpers stop conflating the two; the empty message is now only the empty message |
| `scripts/layout-fixtures/loading-skeletons-fixture.tsx` | Modify | Adds a table-row comparison |
| `.claude/skills/autoreas-theme/SKILL.md` | Modify | Mandatory loading-state section |

## Testing Strategy

RED first per surface: the loading branch exposes `getByRole('status', { name })`; placeholder count is
asserted where the placeholder is a list; the resolved and error branches expose neither the region nor
a placeholder. Table surfaces additionally assert the header is still present while loading and that
the table is `aria-busy`.

`LoadingBars` gets its own suite: it renders `count` bars, names its region from `label`, and its
adopting surfaces assert through the role rather than through its internals.

The layout fixture gains one table comparison, measuring a skeleton row against a real row.

## A surface the inventory could not see

The scope for this change was built by grepping for `Loading [a-z]`, which finds a loading state only
if it says something. `BridgeStatusCard` renders a bare `<Spinner size="sm" />` where its status
`Chip` will go, with no text at all, so it was invisible to that inventory and to the previous
change's. The verification sweep — which greps for `<Spinner` as well as for sentences — is what found
it.

It is now a chip-shaped placeholder in a named status region, sharing one class with the chip so the
row height does not change when the status lands. Worth recording as a method note: an inventory built
from text misses every silent loading state, and a spinner is silent by construction.

The other surviving `<Spinner>`, in `DevicesWorkspace`, is deliberately left alone. It sits inside a
`Button`'s `isPending` render prop — a busy control, not content being loaded — and the rule this
change installs is about placeholders for content.

## Test infrastructure hardening found along the way

`SyncingAnimePanel.test.tsx` had no `afterEach(cleanup)`, so adding loading assertions to it made a
later query find elements a previous test had left behind. That is not one file's oversight: Testing
Library registers cleanup for you only under `globals: true`, this project runs `globals: false`, and
**19 of 115 component suites** never registered it themselves.

Leaked DOM is worse than the loud failure it caused here — a query can also *succeed* against an
element the previous test rendered, which is a green test proving nothing. `src/test/setup.ts` now
registers `afterEach(cleanup)` once, which is the deterministic guard; a per-file `afterEach` is
discipline, and discipline is exactly what those 19 files had already lost. Calling cleanup twice is
harmless, so the files that do register it are unaffected.

Measured: adding it unmasked **zero** latent failures — 2440 tests still pass. Nothing was relying on
the leak; the suites were simply unprotected.

## Migration / Rollout

No backend, schema or wire change. Each group reverts independently.

## Open Questions

None.
