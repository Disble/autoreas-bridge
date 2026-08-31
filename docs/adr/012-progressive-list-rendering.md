# ADR-012: Progressive list rendering for long rails

- **Status**: Accepted
- **Date**: 2026-08-04
- **Supersedes**: nothing
- **Related**: `docs/adr/015-frontend-architecture-rails.md`, `.claude/skills/autoreas-theme/SKILL.md`

## Context

Several panels render a full collection into a fixed-height scroll container and
mount every row on open:

- The Anime Editor library rail (~857 animes).
- The Downloads solo-anime rail (the whole readiness catalog).
- The Catalog panel (`max-h-[28rem]`, every filtered anime).
- The Downloads run-history rail (previously button-paginated).

Two problems follow. The DOM cost is paid up front for rows nobody scrolls to,
and — the one users actually complain about — the scroll thumb collapses to a
sliver, which reads as "this list is enormous and I am lost in it".

## Decision

Long rails render **progressively**: an initial batch of rows, growing by a
batch each time the user scrolls near the bottom. Rows accumulate and are never
unmounted.

The shared primitives are:

| Concern | Module |
|---|---|
| Geometry (`isNearListBottom`, `nextRenderLimit`) | `frontend/src/shared/helpers/progressive-list.helpers.ts` |
| Window state (`useProgressiveListWindow`) | `frontend/src/shared/hooks/use-progressive-list-window.ts` |
| Batch sizes | `frontend/src/shared/constants/progressive-list.constants.ts` |

The window hook returns `{ scrollRef, onScroll, visibleCount }`; the panel
renders `items.slice(0, visibleCount)` inside an `overflow-y-auto` container
that is bounded in height, and wires `onScroll`/`ref` to that container.

### Static lists vs live lists — the part that bites

`useProgressiveListWindow` performs a **render-phase reset**: when `itemCount`
changes, the render limit drops back to the initial batch. Whether that is
correct depends on why the count changes.

| List kind | What to use | Why |
|---|---|---|
| **Static** — count changes only from filtering, searching, or a one-shot fetch | `useProgressiveListWindow` wholesale | The reset is the desired behaviour: a new search must start at the top with a fresh batch |
| **Live** — count changes because events push new items into a store | Keep the panel's own reconciliation; reuse **only** `isNearListBottom` | The reset would snap the user back to the first batch every time an event lands, discarding their scroll position mid-browse |

Editor, solo-anime download, and Catalog are static. Run history is **live**
(`subscribeRunEvents` feeds the download-runtime store), so it keeps
`reconcileVisibleRunCount` — which deliberately preserves the window, keeps the
selected run rendered, and keeps a fully-revealed list revealed — and reuses
only the geometry helper for the scroll trigger.

Dropping the shared hook into a live list is a silent regression: it type-checks,
it looks right, and no existing test necessarily catches it.

## Enforcement

There is **no lint rule for this, deliberately.** The trigger condition is "this
list can get long", which is not statically decidable. An ESLint
`no-restricted-syntax` selector cannot express "this `.map()` sits inside an
`overflow-y-auto` container and its array is not sliced" — esquery reaches
neither the `className` string nor that cross-node relationship. A rule built on
approximations would be mostly false positives, and a noisy rule gets disabled,
which is worse than no rule.

The deterministic guard is a **DOM-count test per rail**, following
`AnimeEditorWorkspace.windowing.test.tsx`: render more items than one batch and
assert the number of rendered rows equals the batch size. It fails loudly, it
cannot drift, and it is cheap.

Every panel adopting this pattern MUST ship that test.

## Alternatives rejected

**`ListBox` + `Virtualizer`/`ListLayout` windowing.** True windowing keeps the
DOM small, but the padded full-height scrollbar reads as "all 842 are loaded",
which is the perception problem we set out to fix. Worse, `ListBox` with
`selectionMode="single"` fires `onAction` only on double-click — single-click
merely selects — so click-to-navigate silently broke.

**Fixed-height windowing** (`slice(start, end)` plus top/bottom spacer padding).
Same "scrollbar looks full" perception problem, with added complexity from
measuring row heights.

**Backend pagination.** The collections are small enough to fetch in one call
and the app is a local desktop client; paginating the wire would add round-trips
and stale-window problems to solve a rendering issue.

## Consequences

- Rows accumulate, so a user who scrolls to the bottom of an 857-item rail ends
  up with 857 mounted rows. Acceptable at this scale; revisit if a collection
  reaches five figures.
- The scroll thumb starts short and grows, which is the honest signal.
- Any panel with a long rail now needs a bounded-height scroll container. Lists
  that previously relied on page-level scroll must gain their own scroller,
  which is a visible layout change.
- New long lists must classify themselves as static or live before picking the
  hook. That classification belongs in the panel's hook comment.

## Addendum (2026-08-30, SDD-65): live lists whose batches come from a cursor-paged server query

Every rail this ADR was written for slices a collection that is already fully in
memory. Activity's Runtime Events and Transactions rails are the first that are
**live** (an event stream pushes items) **and** read a table that outlives the
process, so "load more on scroll-near-bottom" cannot pull the next batch from a
local buffer — it fetches the next cursor page from the backend.

Nothing about the decision changes. Such a rail takes the **live** branch above:
it does NOT use `useProgressiveListWindow` (its render-phase reset would snap the
user back to the first batch on every event), it keeps its own reconciliation,
and it reuses only `isNearListBottom`. Rows are appended and never unmounted, and
the scrollbar still starts short and grows. Only the ORIGIN of a batch changes:
memory becomes SQLite.

Two things this addendum explicitly does NOT do:

1. **The rejection of `ListBox` + `Virtualizer`/`ListLayout` windowing is
   unchanged.** It was rejected on honesty — a padded full-height track reads as
   "everything is loaded" — not on cost, so "HeroUI ships it for free" does not
   reopen it. `Table.ColumnResizer`, `Table.SortableColumnHeader` and
   `Table.ResizableContainer` are orthogonal to the scroll model and remain
   available.

   > **Correction, 2026-08-31.** This addendum originally named
   > `Table.LoadMore` / `Table.LoadMoreContent` as the render primitives for a
   > server-paged live rail. **That was wrong, and it shipped the same bug
   > twice** — into the Transactions rail and, latent, into Notifications.
   > `Table.LoadMore` is React Aria's `useLoadMoreSentinel`: its `rootMargin`
   > is a full container height, and its layout effect rebuilds the
   > IntersectionObserver on every collection change, so a rail that appends
   > what it fetched re-triggers itself and pages to exhaustion with no user
   > input. The hook's own comment hands that problem to the caller: it "will
   > be called if the collection changes, even if onLoadMore was already called
   > and is being processed. Up to user discretion as to how to handle these
   > multiple onLoadMore calls." An in-flight guard does not help — it stops
   > concurrent fetches, not the next one.
   >
   > **A live rail's load-more trigger is `onScroll` + `isNearListBottom`, wired
   > on the element that actually scrolls** — which under HeroUI's `Table` is
   > the wrapping `overflow-y-auto` div, never `Table.ScrollContainer`, which
   > is horizontal-only. That is what the live branch above already said, and
   > `NetworkTable.tsx` was following it correctly the whole time. See
   > `63ca928` (Transactions) and the Notifications fix that followed.
2. **The "revisit if a collection reaches five figures" trigger has NOT fired.**
   Measured against the live `bridge.db` on 2026-08-30, after roughly one month
   of real use: `runtime_events` 4,530 rows of a 20,000 cap (22.7%),
   `request_captures` 1,317 of 5,000 (26.3%), busiest single day 538 events.

**This is not a contradiction of the rejected "Backend pagination" alternative
above.** That rejection is scoped to collections "small enough to fetch in one
call" — true of the Editor's 857 in-memory animes, and the reason it was right
to refuse round-trips for a rendering problem. It is not available for a
20,000-row cap. Activity's source is ALREADY keyset-cursor-paged by construction:
`ListCaptureTransactions` returns a `nextCursor` today that nothing consumes, and
`eventlog.Reader.Search` is cursor-paged. Activity is not adding wire pagination
to fix rendering; it is consuming a cursor the backend already emits.
