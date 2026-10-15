/**
 * Shape shared by the real `LookupCandidateRow` and its
 * `LookupCandidateSkeleton` placeholder, so the two cannot drift apart
 * silently and the list does not jump once real candidates arrive (design D8,
 * mirroring `CATALOG_LIST_ROW_CLASS`).
 */
export const LOOKUP_CANDIDATE_ROW_CLASS =
  'min-h-14 h-auto flex w-full items-center justify-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]';

/**
 * The cover slot every candidate row reserves, real or placeholder. Fixed on
 * BOTH axes and `overflow-hidden` so the artwork fills it rather than sizing
 * it: remote covers arrive at whatever aspect ratio the title has, and sizing
 * the `<img>` itself let those ratios set each row's thumbnail width, which
 * pushed every title to a different left edge.
 */
export const LOOKUP_CANDIDATE_COVER_SLOT_CLASS = 'size-10 shrink-0 overflow-hidden rounded';

/**
 * How many placeholder rows the lookup modal's loading skeleton renders
 * (design D8), mirroring the row count of sibling list skeletons in this
 * repository (e.g. `HISTORY_TABLE_SKELETON_ROW_COUNT`).
 */
export const LOOKUP_SKELETON_ROW_COUNT = 5;
