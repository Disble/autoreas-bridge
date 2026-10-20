# Lists

Decision record: `docs/adr/012-progressive-list-rendering.md`.

## Lists that may reach 100 rows: progressive windows

Render an initial window and grow it near the bottom. The scrollbar starts short and grows, so users
do not read it as "everything loaded".

### Static lists (count changes only on filter or search)

`useProgressiveListWindow` (`shared/hooks/use-progressive-list-window.ts`) returns
`{ scrollRef, onScroll, visibleCount }`. Render `items.slice(0, visibleCount)` of selectable `Button`
rows (`onPress` selects) inside a height-bounded `overflow-y-auto` div. Geometry lives in
`shared/helpers/progressive-list.helpers.ts` (`isNearListBottom`, `nextRenderLimit`), batch sizes in
`shared/constants/progressive-list.constants.ts`.

- The window resets to the first batch when the item count changes, through a render-phase reset
  (`if (itemCount !== seen) { setSeen(itemCount); setRenderLimit(initial) }`), not an effect (that
  dodges `react-doctor/no-derived-state-effect`).
- Do not re-implement the window per feature, and do not map a full `Button` column (800 rows).
- One window can feed several views. Catalog's grid and list render the same `visibleCount` slice
  inside one scroll container (`data-testid="catalog-results-scroll"`), the only part of its
  viewport-height panel that scrolls. Its rows are `Link`s to the detail route, not selectable
  `Button`s, because a pick navigates.

### Live lists (an event stream pushes items into a store)

Keep the panel's own window reconciliation and use **only** `isNearListBottom` as the scroll trigger.
`RunHistoryPanel` is the reference. Never `useProgressiveListWindow` here: its render-phase reset
snaps the user back to the first batch every time an event lands.

### Rejected paths (do not retry)

- **`ListBox` + `Virtualizer` / `ListLayout` windowing.** The DOM stays small, but the full-height
  padded scrollbar reads as "all 842 loaded", and `ListBox` with `selectionMode="single"` fires
  `onAction` only on double-click, so click-to-navigate broke.
- **Fixed-height windowing** (`slice(start, end)` with spacer padding): the same full-scrollbar
  perception problem.

### Proof

There is deliberately no lint rule ("this list can get long" is not statically decidable). Each rail
gets a DOM-count test proving one batch renders, in the shape of
`AnimeEditorWorkspace.windowing.test.tsx`, not just a test of the pure math.

Related gotcha from the Editor rail: a `params.id → selectedAnimeId` sync effect reverted the user's
pick during the async `navigate` render (stale `params.id`). Guard such effects with a previous-param
ref so they react only to real URL changes.

## Status column in a list row

One `shrink-0` fixed-width slot plus a `min-w-0 flex-1` name, holding a **one-word** tag (a soft chip,
`components/chips.md`). A full status sentence inline next to the name makes each row a different
width and repeats on every row; keep the full sentence for the selection's `Alert`.

## Empty lists

A list's resolved-empty state follows `empty-states.md`. Inside a board or accordion where several
lists can be empty at once, each uses `size="row"`.
