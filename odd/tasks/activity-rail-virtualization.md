# Activity rails: bound the rendered window

## Goal

The Activity rails must not mount every row they have ever revealed. Today the
Transactions rail (and the Runtime Events rail, which shares the design) appends
rows as the user pages and **never unmounts one**, so the mounted row count grows
without a ceiling and every store change re-renders all of it. That is the
mechanism behind the renderer freeze the owner hit twice: WebView2 reported
`WebView2Process failed with kind 2` (`RENDER_PROCESS_UNRESPONSIVE`) — the window
stayed painted and stopped answering.

The owner's decision (2026-09-20): **virtualize with a library**, so the DOM is
bounded to what is visible plus a small overscan, while the scrollbar and the
selection stay honest.

## Measured evidence (2026-09-20)

The first incident report named the search box, and the search cost was real and
was fixed (see `odd/tasks/activity-search.md`: 144–359 ms per query became
sub-millisecond). This unit is the *next* bottleneck, and it was measured before
being touched.

Live-database evidence that the freeze was **not** the live stream or the read
path: during the owner's session (app started 16:07:15) the store received **zero
captures** (newest is 14:40) and emitted **five events, all at startup**, so the
rails saw no pushes at all.

Measurements in jsdom — these show the *shape* of the cost, not the app's
absolute numbers, and jsdom is slower than Chromium:

| Mounted rows | DOM nodes | First render | Re-render |
| --- | --- | --- | --- |
| 25 | 395 | 204 ms | 173 ms |
| 50 | 770 | 259 ms | 152 ms |
| 100 | 1 520 | 1 448 ms | 3 006 ms |
| 250 | 3 770 | 2 335 ms | 3 081 ms |
| 500 | 7 520 | 2 876 ms | 3 064 ms |
| 1 000 | 15 020 | 8 097 ms | 6 908 ms |
| 2 000 | 30 020 | 13 309 ms | 19 381 ms |

Ruled out by measurement, not by argument: the detail inspector renders 45 DOM
nodes and 20–80 ms **regardless** of body size (543 B, 8 KB and 65 KB); the
facts hook reads once per mount; the query path is sub-millisecond.

The mechanism: ~15 DOM nodes per row, `TransactionTable` is **not memoized**
(the rows are), so each keystroke re-renders every mounted row while the store's
filter text changes — and the rail's window only ever grows. With the owner's
`/api` filter matching ~1 700 of 3 059 captures, deep paging is one scroll away,
and past a few hundred mounted rows one keystroke costs hundreds of milliseconds
to seconds. In dev (`React.StrictMode`, unminified) that doubles.

## Decisions

- **Virtualize with the library already installed.** `react-aria-components@1.19.0`
  exports `Virtualizer` + `TableLayout` (verified in the installed package's
  types: `dist/types/exports/index.d.ts` re-exports both), and it is the same
  accessibility stack the HeroUI `Table` is built on. That is the owner's
  "virtualize with a library" choice with no new dependency.
- **`@tanstack/react-virtual` is the declared fallback**, not the default: it is
  taken only if the composition spike shows HeroUI's `Table` cannot sit inside
  React Aria's `Virtualizer`, and the reason is recorded before the dependency is
  added.
- **The store keeps the loaded rows; only the DOM is bounded.** Paging, cursors
  and dedupe are untouched: this unit changes what is rendered, never what is
  fetched or held.
- **ADR-012 must be updated**, because its live-list rule ("rows are appended and
  never unmounted, so the scrollbar starts short and grows honestly") is exactly
  what this unit replaces. The honest scrollbar survives through the virtualizer's
  spacers; the "never unmount" invariant does not, and pretending otherwise would
  leave the record lying.
- The same treatment applies to the Runtime Events rail (7 682 events, same
  append-and-grow design), so the freeze is closed where it can happen, not only
  where it was reported.

## Progress log

### Tasks 1 and 2 — spike and the Transactions rail

Spike verdict: the composition works. 2 000 rows loaded, ~27 mounted with overscan 5 at a
1024x600 rect, virtual total 72 000 px, scroll to index 1 500 mounting it and unmounting
row 0 — with the spacer `<td>` really carrying `colspan=6` inside a real `table > tbody`,
no React Aria complaint, and `Table.Row` accepting a ref (the seam dynamic measurement
would need later). React Aria's own `Virtualizer`/`TableLayout` was verified unavailable
to us: HeroUI does not re-export them and `react-aria-components` is an undeclared
transitive dependency pinned below HeroUI's own peer range, so `@tanstack/react-virtual`
(installed and declared) is the honest route.

Implementation: the window hook owns the scroll ref and a `useVirtualizer` over the
LOADED rows and returns the in-view rows plus both spacer heights; the dumb table renders
the spacers and attaches the ref, keeping the scroll container's class and
`data-transaction-scroll` so the layout gate measures the same element. The grow-only
window (`visibleCount`, `reconcileVisibleEventCount`, `onScroll`) is deleted. Load-more
fires from the range change, gated so a page shorter than the viewport cannot page the
rail at mount. A head insertion compensates the offset by the prepended height while the
user is away from the top. Row height stays a constant 36 px with the drift recorded (the
layout smoke measures 36–39 px), and dynamic measurement stays available through the ref
the spike proved.

### The mutation gate earned its keep: three rounds, sixteen survivors closed

Every survivor was closed by a table row, a stronger fixture, or by DELETING redundant
code — never by a suppression.

| Round | Survivors | What closed them |
| --- | --- | --- |
| 1 | 8 | Early-return guards with `===` instead of one compound `&&`; the `useCallback` ref wrapper deleted (React's setState is already stable, so the wrapper existed only to give the gate a dependency array to weaken) |
| 2 | 4 | The measurement seam made observable (a LOCAL observer that measures synchronously on attach and keeps a `ResizeObserver`), the zero-check reduced to the HEIGHT alone, and the `prependedCount === 0` guard deleted as provably equivalent (`scrollTop += 0` is a no-op) |
| 3 | 0 | `resolveWindowViewport` un-exported (it was a dead export) and the hook's test file split at its natural seam into range and viewport siblings |

Two lessons worth keeping: a guard whose other side is a no-op (`x > 0` → `>= 0`) is
provably equivalent and can never be killed — the fix is to delete the redundancy or
reshape it into exact-equality early returns whose both sides are observable; and a seam
that jsdom never exercises (an inert `ResizeObserver` stub) leaves whole branches
uncovered, which is why the observer now measures synchronously instead of waiting for a
callback that never arrives in tests.

## Tasks

- [x] **1. Spike the composition.** Prove, with a DOM-count test, that HeroUI's
  `Table` renders inside React Aria's `Virtualizer` with `TableLayout` and that
  the mounted row count stays bounded with thousands of loaded rows. Record the
  outcome; if it cannot compose, record why and take the `@tanstack/react-virtual`
  fallback.
  **Outcome**: React Aria's route was verified unavailable (HeroUI does not re-export
  `Virtualizer`/`TableLayout`, `react-aria-components` is an undeclared transitive
  dependency pinned at 1.19.0 below HeroUI's own `^1.20.0` peer range), so the owner's
  chosen library is the clean path. The spike then proved the composition: 2 000 rows
  loaded, ~27 mounted with overscan 5 at a 1024x600 rect, virtual total 72 000 px, scroll
  to index 1 500 mounts it and unmounts row 0, spacer `<td>` really carries `colspan=6`
  inside a real `table > tbody`, React Aria logs nothing, and `Table.Row` accepts a ref
  (`HTMLTableRowElement`) — the seam `measureElement` would need later.
- [x] **2. Virtualize the Transactions rail.** Bound the mounted window, keep the
  selected row reachable, preserve scroll position, and keep the existing
  load-more contract (a virtualizer reaching the end of the loaded rows asks for
  the next cursor page).
  **Done**: the window hook now owns the scroll ref and a `useVirtualizer` over the
  LOADED rows, and returns the in-view rows plus the two spacer heights; the dumb table
  renders the spacers and attaches the ref, with the scroll container's class and
  `data-transaction-scroll` untouched. The grow-only `visibleCount`/`reconcileVisibleEventCount`
  path is deleted. Load-more fires from the virtualizer's range change, gated so it never
  pages on its own at mount; a head insertion compensates `scrollTop` by the prepended
  height while the user is away from the top, so a pushed row cannot move what they read.
  Constant 36 px estimate with the drift risk recorded (the layout smoke measures rows at
  36–39 px). The spike file was deleted once its assertions moved into the production
  tests.
- [ ] **3. Virtualize the Runtime Events rail** on the same approach, so the two
  rails do not drift into two different windowing rules.
- [ ] **4. Pin the bound with DOM-count tests on both rails**: after paging deep,
  the number of mounted rows never exceeds the window however many rows are
  loaded, and a pushed row still does not disturb what the user is reading.
- [ ] **5. Update ADR-012 and log the lesson**, including the measurement that
  forced the change.
- [ ] **6. Verify at the boundary**: render smoke and layout smoke (the
  virtualizer changes the DOM structure the layout gate measures), plus an
  interaction-cost measurement at a deep-paged state, before and after.
- [ ] **7. Close**: gates (frontend staged mutation zero-tolerance, typecheck,
  lint, size), one work-unit commit per task at least, and the numbers recorded
  here.

## Constraints

- A stateful widget shared by several features lives in `frontend/src/shared/`;
  windowing rules shared by two rails do not belong in one of them.
- No `eslint-disable`, no Stryker suppression, no weakened assertion, no skipped
  test. Survivors are closed with table rows, never with suppression.
- `AGENTS.md` invariants stay: keyboard shortcuts through the registry, no
  `@dnd-kit/core`, `React.StrictMode` never removed, colocated tests, JSDoc on
  every declaration, files ≤500 lines.
- The rails are live: nothing in this unit may make a push unmount a row the user
  is reading or move the scroll under them.

## Open questions recorded

- Whether the Runtime Events rail's overlay (its pushed rows) belongs inside the
  same virtualized count or stays as a separate bounded overlay.
- Whether the virtualizer's row-size estimate can be replaced by the row height the
  layout smoke already measures (36–39 px), or must stay dynamic.
