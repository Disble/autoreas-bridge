/**
 * Exact accessible name of the creation action offered by every actual-empty
 * Airis state. One constant because Today, the Editor Library, and Catalog are
 * all specified against this same wording, and a per-feature copy would let one
 * of them drift without failing anything.
 */
export const AIRIS_CREATE_ANIME_LABEL = 'Create an anime';

/**
 * Exact accessible name of the recovery action offered by a criteria-empty
 * Airis state, where the collection has rows but the active search or filters
 * hide all of them.
 */
export const AIRIS_CLEAR_CRITERIA_LABEL = 'Clear search and filters';

/**
 * Display size for the artwork.
 *
 * The assets are authored at 512px so they stay sharp on a high-DPI panel, but
 * that is a source size. Without a cap the browser renders the source size, and
 * the first build shipped exactly that: a 512px illustration filling the Today
 * panel and pushing its own recovery button below the fold.
 *
 * `w-40` (10rem) pins the width, `h-auto` lets the height follow the square
 * aspect, and `max-w-full` lets a container narrower than 10rem shrink it
 * rather than overflow. `scripts/layout-fixtures/airis-empty-states-fixture.tsx`
 * measures all three of those in a real browser, at a full-width page and in
 * the Editor rail's narrow column.
 */
export const AIRIS_ARTWORK_CLASS = 'h-auto w-40 max-w-full';
