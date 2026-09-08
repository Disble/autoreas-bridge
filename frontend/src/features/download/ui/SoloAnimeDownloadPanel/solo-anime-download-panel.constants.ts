import type { DownloadReadinessReason } from '../../../../shared/contracts/download.types';

/** Empty-state text shown while no anime has been selected. */
export const SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION = 'Select an anime to start a one-off catch-up download.';

/** Accessible name for the status region announced while readiness is loading. */
export const SOLO_ANIME_DOWNLOAD_LOADING_LABEL = 'Loading readiness...';

/**
 * Shared geometry for a rail row, used by both the resolved row and
 * `SoloAnimeDownloadSkeleton`'s placeholder rows so the two shapes cannot
 * drift apart. Border color is intentionally excluded: it is state-dependent
 * (selected/ready) and applied by each caller.
 */
export const SOLO_ANIME_DOWNLOAD_ROW_CLASS =
  'h-auto min-h-11 w-full min-w-0 justify-between gap-4 rounded-xl border-l-2 px-3 py-2 transition-colors';

/** Number of placeholder rows rendered while readiness is loading. */
export const SOLO_ANIME_DOWNLOAD_SKELETON_ROW_COUNT = 6;

/** Backend response shared with the global manual download trigger. */
export const SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE = 'schedule: a download run is already in progress';

/**
 * Tab metadata for the readiness partition. Ready and Blocked are disjoint, so
 * no anime is reachable from both tabs and the two counts always add up to the
 * search result. Ready leads because it is the only tab the user can act on.
 */
export const SOLO_ANIME_DOWNLOAD_FILTER_OPTIONS = [
  { id: 'ready', label: 'Ready' },
  { id: 'blocked', label: 'Blocked' },
] as const;

/**
 * Compact column tags for the readiness blockers. These are presentation, not
 * vocabulary: the canonical user-facing sentences stay in
 * `shared/constants/download-readiness` and are what the selection alert reads.
 * A one-word tag differs row to row, which is what makes the column scannable —
 * the same full sentence repeated hundreds of times does not.
 */
export const SOLO_ANIME_DOWNLOAD_REASON_TAGS: Readonly<Record<DownloadReadinessReason, string>> = {
  missing_source: 'No source',
  invalid_source: 'Invalid source',
  unsupported_source: 'Unsupported',
  destination_unresolved: 'No destination',
};

/** Tag for a blocked row the backend sent without any reason code. */
export const SOLO_ANIME_DOWNLOAD_GENERIC_BLOCKED_TAG = 'Blocked';
