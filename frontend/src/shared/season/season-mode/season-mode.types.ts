import type { SeasonQuerySource, SeasonSnapshot } from '../../contracts/season.types';

/**
 * Whether season mode is on, which is exactly "a season is open":
 * `pending` while the `season` module starts or the read is in flight (or the
 * read is disabled), `open` or `closed` once it answered, `failed` when the
 * module failed or the read rejected before any answer.
 */
export type SeasonModeStatus = 'pending' | 'open' | 'closed' | 'failed';

/** The season read season mode goes through: the open season, or null. */
export type SeasonModeSource = Pick<SeasonQuerySource, 'readSeason'>;

/** The part of the open-season query result season mode is derived from. */
export interface SeasonModeQueryState {
  /** The open season, null when none is open, undefined before any answer. */
  readonly data: SeasonSnapshot | null | undefined;
  /** The query status. */
  readonly status: 'pending' | 'error' | 'success';
}
