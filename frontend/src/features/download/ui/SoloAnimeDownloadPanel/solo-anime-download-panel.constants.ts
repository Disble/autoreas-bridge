import type { Anime } from '../../../../shared/contracts/anime.types';

/** Maximum number of search results shown before the query narrows the list further. */
export const SOLO_ANIME_DOWNLOAD_MAX_RESULTS = 8;

/** Empty-state text shown while no anime has been selected. */
export const SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION = 'Select an anime to start a one-off catch-up download.';

/** Backend response shared with the global manual download trigger. */
export const SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE = 'schedule: a download run is already in progress';

/** Minimal complete anime used by tests and fallback rendering. */
export const SOLO_ANIME_DOWNLOAD_EMPTY_ITEMS: readonly Anime[] = [];