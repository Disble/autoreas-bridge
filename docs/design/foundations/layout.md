# Layout

`AppLayout`'s `<main>` has no `overflow` and the root is `min-h-screen`, so **the window is the
scroller**. There is no app-level internal scroll container, and nothing upstream contains an
over-wide child for you.

## Page header

Every screen titles itself with `shared/ui/PageHeader`: the `h1`, an optional inline `adornment`
(a status chip such as Notifications' unread count) and optional right-aligned `actions`, in one
vertically centered row. There is no subtitle under the title.

## Containment: a card must never widen the page

A single unbroken URL deep inside a card gives the whole application a horizontal scrollbar.
Measured 2026-08-30 on the Activity detail card: 40 trace siblings carrying a JDownloader URL produced
2950px of content in a 471px card and a 3719px document at a 1241px viewport.

Rules, in the order they bite:

- **Never write a bare `1fr` grid track.** `1fr` is `minmax(auto, 1fr)`; the `auto` minimum is
  content-based, so the track grows past its container. Write `minmax(0,1fr)`. For one column write
  `grid-cols-1` (Tailwind expands it to `repeat(1, minmax(0,1fr))`), never a bare `grid`.
- **`min-w-0` on the grid/flex ITEM as well.** A bounded track does not stop an item whose own
  `min-width` is `auto`. The Activity rails share one arrangement for this reason:
  `ACTIVITY_MASTER_DETAIL_CLASS` (`features/network/ui/ActivityView/activity-view.constants.ts`),
  used by `NetworkPanel` and `TransactionPanel`.
- **Prose wraps; only code scrolls.** Trace messages, header values and identifiers get `break-all`:
  the user has to read the end of a token, and an ellipsis hides the part that distinguishes one from
  another. Keep horizontal scroll for a `<pre>` of real code, and bound it at the CARD, not the pane.
- **`truncate` was containing things quietly.** It sets `overflow: hidden`, which zeroes an item's
  automatic minimum size. Swapping `truncate` for `break-all` removes that containment; add the
  `minmax(0, …)` track in the same edit.
- **A scroll container does not leak its width.** Measured: a `<pre class="overflow-auto">` held a
  7973px line inside a 391px pane with no `min-w-0` above it. `min-w-0` on such a wrapper is
  hardening, not the fix; do not write a comment claiming otherwise.

Verify containment in a browser (`process/verifying-design-claims.md`), never in vitest.

## Filling the height: the vertical mirror of `min-w-0`

Containment and fill are the same mechanism from opposite ends. Measured 2026-08-30: bounding the
Activity panes with a fixed `max-h-64` left 261px of empty card under the Trace list and 165px under
the body pane, because the grid stretches the detail card to the rail beside it.

- **Cap the CARD, fill the panes.** The pane gets `flex-1 min-h-0 overflow-auto`; the card carries
  the height budget (`ACTIVITY_RAIL_HEIGHT_CLASS`, `max-h-[32rem] 2xl:max-h-[40rem]`, the same figure
  as the rail beside it). A `flex-basis: 0` item still contributes its content height to its
  container's intrinsic size, so an uncapped card grows to a 6916px trace list and takes the grid row
  with it.
- **`min-h-0` at EVERY level.** The chain is card → `Card.Content` → `Tabs` → `Tabs.Panel` → pane;
  miss one and the scroller never engages. HeroUI's `.card` is already `flex flex-col` and
  `.card__content` already `flex-1`, but neither releases the automatic minimum size, and
  `.tabs__panel` is a plain block that needs `flex flex-col`.
- **A filling pane takes the REMAINDER, so bound what sits above it.** An unbounded headers block of
  `break-all` URLs left the body pane 22px of a 512px card. Give such a block `min-h-0
  overflow-y-auto`, and give the pane a floor (`min-h-40` on `CodeBlock`'s wrapper). The floor belongs
  on the item that competes in the parent's flex line; on the `<pre>` it did nothing.
- **Measure the dead band, not the cap**: pixels unused between the pane's bottom and the card's,
  summed one ancestor at a time (direct children only). A fill fixture needs ORDINARY chrome as well
  as hostile content. Both are in `frontend/scripts/layout-fixtures/activity-detail-fixture.tsx`.

## Multi-column card packing (masonry-lite)

For a page of variable-height cards, `grid grid-cols-2` locks each row to its tallest card. Use CSS
multi-column, not a masonry library:

```tsx
<div className="min-w-0 columns-1 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
  <Card>…</Card> {/* repeat */}
</div>
```

- Native CSS masonry is dead code here: Wails → WebView2 → Chromium stable has not shipped
  `grid-template-rows: masonry`, so `@supports (grid-template-rows: masonry)` is always false.
- `react-masonry-css` is not worth a dependency for a few settings cards; only consider it if strict
  row-major reading order is required.
- Vertical rhythm needs `[&>*]:mb-4` (`gap` only sets the column gap). Every child needs
  `break-inside-avoid`. Cards flow DOWN each column; balance by reordering the JSX.
- A full-width card cannot live inside a multi-column container (no column-span). Pull it out as a
  sibling below; `col-span-2` is grid-only.
- **`columns` vs `grid`:** use a responsive `grid-cols-1 xl:grid-cols-2` when tiles live inside a
  fixed-height `overflow-y-auto` scroller or when row order matters; `columns` fills column 1 to the
  container's max height before wrapping.
- A page's top-level stack of full-bleed sections stays one section per row. Pack cards within a
  section; never columnize whole sections.

## Filling horizontal space (split-panel cards)

Horizontal whitespace inside one full-width card (a centered image with empty flanks, a form hugging
the left edge) is fixed with an internal responsive split, not by columnizing the page:

```tsx
<Card.Content className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
  <div className="flex min-w-0 flex-col gap-4">{/* text / fields */}</div>
  <div className="flex justify-center lg:justify-end">{/* media */}</div>
</Card.Content>
```

- `minmax(0,1fr)` lets the content column shrink so its children can `truncate`.
- Collapses to `flex flex-col` below the breakpoint.
- Let media grow with the space it earns (`size-40 lg:size-48`).
- The empty-state shell applies the same idea with container queries; see
  `components/airis-empty-state.md`.

## Card cover slot (full-bleed edge image)

HeroUI `.card` has `p-4` and `border-radius: min(32px, var(--radius-3xl))`. For an edge-flowing image
column (Chapters schedule): the Card gets `overflow-hidden`; the slot gets `relative -my-4 -ml-4 w-24
shrink-0 self-stretch overflow-hidden` so the negative margins bleed through the padding and the Card
clips the corners. The art is `absolute inset-0 size-full object-cover` (or an SVG with
`preserveAspectRatio="xMidYMid slice"`) so the source aspect ratio can never change the card height.
Add `gap-4 min-h-24` on the flex row. Default cover art is `shared/ui/CoverPlaceholderScene.tsx`
(night bridge scene), full-bleed, never an icon centered in a gray box.

## Poster grid cover frame (Catalog)

Every cover in a poster grid sits in ONE frame class, so stored covers of different heights cannot
break the row baseline. Catalog's frame is `CATALOG_COVER_FRAME_CLASS`
(`features/catalog/ui/CatalogPanel/catalog-panel.constants.ts`): a uniform 230:326 crop with
`overflow-hidden`, shared by the grid card, the 40px list thumbnail and both skeletons.

`CatalogCoverSlot` fills the frame edge to edge in one of three states:

| State | Renders |
|---|---|
| Lookup pending | A `Skeleton` of the frame's shape |
| Cover resolved | The art, `object-cover` |
| No stored cover, lookup unavailable or empty, or the image fails to decode | The approved Airis "No Cover" poster, `assets/covers/no-cover.webp`, cropped like a real cover |

- The "No cover" text is UI (`CATALOG_NO_COVER_LABEL`, a soft `Chip` over the poster), never baked
  into the art. Cards show it; 40px thumbnails do not.
- The poster is Catalog-only for now. Every other screen keeps `CoverPlaceholderScene` (above) until
  a change asks for the poster there.
- Covers are requested only for the rendered progressive window and only for records with
  `hasCover`, so a long catalog costs one lookup per revealed card (`useCatalogCovers` over
  `shared/anime-cover/use-anime-cover-cache.ts`).

The Catalog sets no width cap or height of its own: it fills `AppLayout`'s container
(`max-w-[1600px]`) and scrolls with the page like every other screen. Because the document is what
scrolls, its window is `usePageProgressiveWindow` (`patterns/lists.md`).
