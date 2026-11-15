import type { SeasonAnimeRow } from '../contracts/season.types';
import { seasonKeys } from '../query/query-keys/query-keys.constants';
import type { SeasonBannerPolicy } from './season.types';

/** Key of the open season. */
export const SEASON_CURRENT_KEY = seasonKeys.key('current');

/** Key of the season list, the past-seasons history. */
export const SEASON_LIST_KEY = seasonKeys.key('list');

/** Season reads stay cached for the whole session, so a Today-side reader keeps what the Season route loaded. */
export const SEASON_SESSION_GC_TIME = Number.POSITIVE_INFINITY;

/** The rows a screen shows before its rows read answered: one shared list, so memoized derivations stay put. */
export const SEASON_NO_ROWS: readonly SeasonAnimeRow[] = [];

/** The banner text of a failed season read. */
export const SEASON_LOAD_FAILED = 'Failed to load season';

/** The banner text of a failed intake rows read. */
const SEASON_ANIMES_LOAD_FAILED = 'Failed to load intake rows';

/** The banner text of a failed season list read. */
const SEASON_LIST_LOAD_FAILED = 'Failed to load past seasons';

/** The banner text of a refused create. */
export const SEASON_CREATE_FAILED = 'Failed to create season';

/** The banner text of a refused close. */
export const SEASON_CLOSE_FAILED = 'Failed to close season';

/** A season command's success status. */
export const SEASON_COMMAND_SUCCEEDED = 'ok';

/** A season read the screen shows: its failure's message reaches the banner, and a new success clears it. */
export const SEASON_REFRESH_BANNER: SeasonBannerPolicy = { fallback: SEASON_LOAD_FAILED, fixedMessage: false, clearOnSuccess: true };

/** The intake rows read a screen shows: its failure's message reaches the banner, and a new success clears it. */
export const SEASON_ANIMES_REFRESH_BANNER: SeasonBannerPolicy = { fallback: SEASON_ANIMES_LOAD_FAILED, fixedMessage: false, clearOnSuccess: true };

/** The intake rows read a screen only needs loaded: a failure shows the fixed text, and a success leaves the banner. */
export const SEASON_ANIMES_ENSURE_BANNER: SeasonBannerPolicy = { fallback: SEASON_ANIMES_LOAD_FAILED, fixedMessage: true, clearOnSuccess: false };

/** The season list read: its failure's message reaches the banner, and a new success clears it. */
export const SEASON_LIST_BANNER: SeasonBannerPolicy = { fallback: SEASON_LIST_LOAD_FAILED, fixedMessage: false, clearOnSuccess: true };

/**
 * The store's view state when the live season is shown again after a past one.
 * It also empties the store's season and rows, which the season screens that
 * still read the store show, so none of them keeps showing the past season.
 */
export const SEASON_LIVE_VIEW_STATE = {
  viewSeasonId: null,
  readOnly: false,
  season: null,
  seasonAnimes: [],
  hasLoadedAnimes: false,
  animesLoadState: 'idle',
} as const;
