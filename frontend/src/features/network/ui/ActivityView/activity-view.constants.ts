/**
 * The grid both Activity rails lay their master table and detail inspector on.
 *
 * It lives here, shared by `NetworkPanel` and `TransactionPanel`, because the
 * track sizing is a containment decision rather than a per-panel taste: a bare
 * `1fr` track is `minmax(auto, 1fr)`, and that `auto` minimum is the item's
 * content-based minimum size, so a detail card holding one unbroken URL can
 * push the track past the viewport and give the whole window a horizontal
 * scrollbar. `minmax(0, …)` is what refuses that, and `grid-cols-1` gives the
 * stacked layout below `lg` the same floor instead of leaving it on a
 * content-sized implicit track.
 *
 * The detail cards still carry their own `min-w-0`: a bounded track does not
 * stop a grid item whose `min-width` is `auto` from overflowing it.
 *
 * `scripts/layout-fixtures/activity-detail-fixture.tsx` mounts the real detail
 * cards on this exact class, so the layout smoke test measures the arrangement
 * the panels ship rather than a copy of it.
 */
export const ACTIVITY_MASTER_DETAIL_CLASS = 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]';
