import type { AirisEmptyStateKind, AirisIconKind } from './airis-empty-state.types';

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
 * The split layout every `card` and `section` empty state uses, sized by its
 * container rather than by the caller (docs/design/patterns/empty-states.md).
 *
 * Below `@xs` (20rem) the container is a narrow rail: the artwork stacks over
 * the copy, still left-aligned so the block keeps one axis. From `@xs` the
 * artwork sits in an intrinsic column with the copy in a bounded
 * `minmax(0,1fr)` column beside it (never a bare `1fr`, which grows past its
 * card). `scripts/layout-fixtures/airis-empty-states-fixture.tsx` measures
 * both geometries in a real browser.
 */
export const AIRIS_SPLIT_CLASS = 'grid grid-cols-1 justify-items-start gap-4 @xs:grid-cols-[auto_minmax(0,1fr)] @xs:items-center @xs:gap-6';

/**
 * Display size of the `first-run` mascot: 88px in a narrow rail, 104px beside
 * the copy, 144px once the container is wide enough (`@xl`, 36rem) to carry
 * it. The assets are authored at 512px for high-DPI panels; that is a source
 * size, never a display size. `object-contain` keeps the square art undistorted
 * and `shrink-0` stops long copy from squeezing it.
 */
export const AIRIS_ARTWORK_CLASS = 'size-22 shrink-0 object-contain @xs:size-26 @xl:size-36';

/**
 * Display size of the `waiting-on-step` mascot: one step smaller than
 * `first-run` on a wide container, so a step that is merely waiting reads as
 * quieter than a surface that has never been used.
 */
export const AIRIS_WAITING_ARTWORK_CLASS = 'size-22 shrink-0 object-contain @xs:size-26 @xl:size-30';

/**
 * Shell of the `section` placement: no card of its own, on the secondary
 * surface of the card it fills, and a size container for the split layout.
 */
export const AIRIS_SECTION_SHELL_CLASS = '@container rounded-3xl bg-surface-secondary py-4 pr-6 pl-4';

/**
 * Content padding of the `card` placement, which is also the size container. A
 * container query never applies to the container itself, so this padding is
 * fixed rather than responsive.
 */
export const AIRIS_CARD_CONTENT_CLASS = '@container px-2 py-2';

/** The disc behind an icon kind's icon in a `card` or `section`, per kind. */
export const AIRIS_ICON_DISC_CLASS: Readonly<Record<AirisIconKind, string>> = {
  filtered: 'flex size-12 shrink-0 items-center justify-center rounded-full bg-default text-muted',
  'caught-up': 'flex size-12 shrink-0 items-center justify-center rounded-full bg-success/15 text-success',
};

/** The smaller disc a `row` shows in place of any artwork, per kind. */
export const AIRIS_ROW_ICON_DISC_CLASS: Readonly<Record<AirisEmptyStateKind, string>> = {
  'first-run': 'flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-muted',
  'waiting-on-step': 'flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-muted',
  filtered: 'flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-muted',
  'caught-up': 'flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success',
};
