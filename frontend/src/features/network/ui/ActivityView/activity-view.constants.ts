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

/**
 * The height budget one row of that grid gets, shared by the master rail and
 * the detail card.
 *
 * Both sides need the SAME figure, and for opposite reasons. The rail is a
 * scroller, so the cap is what stops an accumulating table from growing the
 * page. The detail card is a flex column whose panes fill it (`flex-1
 * min-h-0`), and a flex-basis-0 item still contributes its content height to
 * its container's intrinsic size -- so without a cap here the card would grow
 * to the full height of a 6916px trace list and take the grid row with it.
 * Capping the card is what turns "grow to content" into "fill the box", which
 * is the whole point of the fill chain inside it.
 *
 * The `2xl` step exists because at that width the rails get enough room to be
 * worth more rows, and the detail card follows so the two stay level.
 */
export const ACTIVITY_RAIL_HEIGHT_CLASS = 'max-h-[32rem] 2xl:max-h-[40rem]';

/**
 * The master rail's scroller: that same height budget, plus the scrolling it
 * needs to stay inside it.
 *
 * `[scrollbar-gutter:stable]` reserves the scrollbar's width whether or not it
 * is showing, so rows do not shift sideways as the table fills.
 */
export const ACTIVITY_RAIL_SCROLLER_CLASS = `${ACTIVITY_RAIL_HEIGHT_CLASS} overflow-y-auto [scrollbar-gutter:stable]`;
