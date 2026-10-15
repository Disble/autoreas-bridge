# Tables — sizing and scrolling (verified facts)

Loading placeholders for tables are in `patterns/loading-empty-error.md`.

## Width

- **`.table-root` is `display:grid` with `grid-template-columns: minmax(0,1fr)`**, a hard width
  boundary. Content wider than it overflows, and `Table.ScrollContainer` (`overflow-x-auto`) shows a
  horizontal scrollbar.
- **Do NOT set `overflow-x-clip` on it**: it clips the last column (data loss). Verified.
- **Fix: make the table fit.** `Table.Content className="w-full table-fixed"`, an explicit width on
  each `Table.Column` (for example `w-[92px]`), and the one flexible column (Message) widthless so it
  takes the remainder. Cells truncate with `block truncate` (no `max-w` needed under `table-fixed`).
  Result: no horizontal scrollbar and no clipping.

## Vertical scrolling and live feeds

- `Table.ScrollContainer` scrolls HORIZONTALLY only (`@apply overflow-x-auto`) and is a plain
  function component (no `forwardRef`).
- For a vertical or live feed, wrap `Table` in your own `max-h-… overflow-y-auto` div and keep the
  `scrollRef` on THAT div; it is the vertical scroller (confirmed by an internal scrollbar in the
  running app).

## Stick to bottom

Current approach, pending final runtime confirmation: in a `useLayoutEffect` on `[rows]`, set
`wrapper.scrollTop = wrapper.scrollHeight` both synchronously and inside one `requestAnimationFrame`
(to survive a post-render scroll reset). A jsdom regression test mocks geometry with
`Object.defineProperty(node, 'scrollHeight' | 'clientHeight' | 'scrollTop', …)` and asserts that
`scrollTop` reaches `scrollHeight`.

What did NOT work (do not retry):

- `scrollTop` on the wrapper guarded by a `pinned` flag updated from `onScroll`. The guard was false
  when entries arrived and blocked every scroll; this was the real cause of the failures, not the
  scroll mechanism.
- A bottom sentinel plus `scrollIntoView({ block: 'nearest' })`.
- `overflow-x-hidden` on `ScrollContainer` (CSS promotes Y to `auto`, creating a competing scroller).
- `overflow-x-clip` (clips the last column).
- `[scrollbar-gutter:stable]` alone for the header-corner overlap.
- Resolving the scroll node with `querySelector('[data-slot="table-scroll-container"]')`.
