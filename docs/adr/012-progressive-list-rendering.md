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

> **Update, 2026-09-20.** That closing rule is now branch-specific: it still
> describes the static rails, but for the live rails (Activity's Transactions
> and Runtime Events) the "append rows and never unmount one" half is
> superseded by virtual windowing, and the decision axis is per-interaction
> cost, not accumulated rows. See the addendum below for the decision and its
> measurements before relying on this paragraph for a live rail.

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

> **Update, 2026-09-20.** This table's live row is still correct about
> `useProgressiveListWindow`'s render-phase reset, but the rendering model it
> points at — append rows, never unmount one — has been superseded for
> Activity's two live rails by virtual windowing. See the second addendum
> below; new live rails should read it before following the row as written.

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

> **Update, 2026-09-20.** That guard is the static rails' guard: it pins a
> growing rendered count to the batch size. For the live rails under virtual
> windowing the guard is the opposite shape — the mounted row count stays
> BOUNDED while the loaded collection grows. The addendum below restates the
> enforcement for the new model.

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

  > **Update, 2026-09-20.** For the live rails this bullet is superseded: the
  > accumulation it describes is exactly what virtual windowing removed, and
  > the five-figure revisit trigger was aimed at the wrong axis — the cost that
  > actually fired was per-interaction re-render cost, at three digits. See the
  > addendum below.
- The scroll thumb starts short and grows, which is the honest signal.

  > **Update, 2026-09-20.** For the live rails this bullet is superseded: under
  > virtual windowing the spacer track accounts for every LOADED row, so the
  > thumb reflects loaded size by construction rather than growing as a side
  > effect of mounting rows. See the addendum below.
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

> **Superseded, 2026-09-20, in one respect.** Everything above about WHERE a
> batch comes from (cursor pages over SQLite) and the corrected analysis of the
> load-more trigger element remains the record. The rendering rule this
> addendum kept — rows are appended and never unmounted — did not hold: the
> Activity rails' own growth falsified it, and both rails now render through a
> shared virtual window. See the addendum below for the decision, the
> measurements that forced it, and what jsdom can no longer prove.

## Addendum (2026-09-20): the live branch's append-and-never-unmount rule is superseded by virtual windowing

The addendum above fixed where a live rail's batches come from. Its rendering
rule — append every fetched and pushed row, never unmount one — held until the
Activity rails themselves falsified it. That rule is now superseded for both
Activity rails (Transactions and Runtime Events).

**What was decided before.** A live rail kept its own reconciliation, appended
every row, and never unmounted one. The DOM grew by exactly what the user had
paged through, and the growing scrollbar was held up as the honest signal. The
stated risk was cumulative size, "revisit at five figures".

**Why it stopped holding.** The real cost of never unmounting is not the DOM
that accumulates; it is that every store change re-renders ALL of it. A pushed
row or an in-place terminal delta re-renders every mounted row, so the cost of
one interaction grows with everything ever paged. Measured in jsdom, at a
constant ~15 DOM nodes per row:

| Mounted rows | One store-change re-render |
|---|---|
| 25 | ≈ 200 ms |
| 100 | ≈ 1.4–3 s |
| 1 000 | ≈ 7–8 s |
| 2 000 | ≈ 13–19 s, and mounting them killed the test worker with a JavaScript heap out of memory |

In the real app the same curve froze the WebView2 renderer mid-session:
`WebView2Process failed with kind 2` (`RENDER_PROCESS_UNRESPONSIVE`) — the
window stayed painted and stopped answering input — on a session whose live
database recorded no captures and no events at all. The rails were not
growing at that moment; they were re-rendering rows already mounted. The
trigger that actually fired is per-interaction cost, not total size, so the
five-figure revisit trigger was aimed at the wrong axis and never got the
chance to fire at three digits.

**What is decided now.** Live rails render through one shared virtual window,
`frontend/src/shared/hooks/use-virtual-rail-window/`. The hook owns the scroll
ref and a `@tanstack/react-virtual` virtualizer over the LOADED rows (the
render-phase-reset argument against `useProgressiveListWindow` still holds;
the virtualizer has no reset), and returns the in-view rows plus top and
bottom spacer heights: only the viewport rows plus a small overscan mount,
while the spacers make the scrollbar account for every loaded row. Both rails
delegate to it — `useTransactionPanelWindow` detects the Transactions rail's
own head insertions and feeds `prependCount` to the shared window — so the two
rails cannot drift into two windowing rules.

Three mechanics are part of the decision, not incidental details:

- **Load-more fires from the virtualizer's range change**, inside the
  virtualizer's `onChange`, gated by a has-scrolled flag: at mount the range
  can already touch the last loaded row (a page shorter than the viewport
  measures that way), and firing then would page the rail with no user input —
  the same self-paging shape the `Table.LoadMore` correction above documents.
  This retires the addendum's `onScroll` + `isNearListBottom` wiring for these
  rails; the exhausted cursor remains a no-op inside the rail's load-more.
- **A head insertion compensates the scroll offset.** A pushed live row is a
  prepend: while the user has scrolled away from the top, the offset moves
  with the content (`scrollTop += prependCount * estimateSizePx`) and what
  they are reading stays put. At the very top the new arrivals ARE the content
  to read, so no compensation runs there (DevTools behavior).
- **The row height is a constant estimate whose drift is recorded rather than
  measured.** The estimate is 36 px, the floor of the 36–39 px band the render
  smoke measures on real rail rows. With a constant estimate the spacer math
  is exact for the estimated layout; dynamic `measureElement` was declined
  because it would trade that exactness for per-row measurement the rails do
  not need. The drift risk lives in the constants file, beside the estimate.

This also revisits the original rejection of fixed-height windowing. That
rejection was about honesty: for a static in-memory collection the padded
full-height track read as "everything is loaded". For a cursor-paged live rail
the spacers represent exactly the loaded rows and nothing else, so the track
is honest by construction. The `ListBox` selection/click objections do not
transfer either: the rails own their rows and their selection, not a HeroUI
collection component.

**Consequences the reader must know.**

- **A row may unmount while its selection survives in the store.** Scroll far
  enough and the selected row is no longer mounted; selection lives in the
  store, not the DOM, and the row remounts with the correct visual state when
  scrolled back into view. Any logic assuming "selected ⇒ in the DOM" is now
  wrong.
- **The honest scrollbar is the virtualizer's spacers.** The track height
  equals the loaded rows' estimated total and grows when a page loads, not as
  a side effect of rendering.
- **The cost per interaction is bounded by the window, not by what has been
  paged.** Re-render cost is O(viewport + overscan) regardless of how many
  pages the user has pulled; the measured curve above no longer applies.
- **jsdom cannot prove the two things that matter most.** jsdom fires no
  scroll event for a programmatic offset write and runs no real layout pass,
  so (a) spacer heights agreeing with real rendered rows (36 px estimate
  against the 36–39 px measured band) and (b) head-insertion scroll anchoring
  inside a real engine are carried by the render smoke and by hand in the
  running WebView2, not by the unit suite. The DOM-count enforcement above
  still applies to these rails, restated for the new model: a test asserts the
  MOUNTED row count stays bounded while the loaded collection grows.
