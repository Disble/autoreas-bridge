/**
 * How long the lookup modal's search field settles before firing a request
 * (design D7). Declared separately from `ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS`
 * -- importing a feature constant into `shared/` would be the wrong
 * direction, and the two numbers exist for different reasons: that one is
 * local anti-flicker, this one spares a Wails round trip.
 */
export const METADATA_LOOKUP_DEBOUNCE_MS = 300;

/**
 * The minimum query length once the query contains any non-Basic-Latin code
 * point (design D7a). Two CJK characters already carry enough signal to be
 * a complete title -- e.g. `銀魂` and `ナル` both return their exact anime
 * as the top hit at length 2.
 */
export const METADATA_LOOKUP_MIN_LENGTH_WIDE = 2;

/**
 * The minimum query length for an all-Basic-Latin query (design D7a). Two
 * Latin letters return generic noise rather than a specific title -- `bl`
 * measured a same-length CJK counterpart's exact match as noise instead.
 */
export const METADATA_LOOKUP_MIN_LENGTH_LATIN = 3;

/**
 * MyAnimeList's `Type:` vocabulary mapped to the bridge's closed four-value
 * `kind` enum (design's Field Mapping table, `anime-tipo.constants.ts`).
 * `ONA`, `Music`, and every other MyAnimeList type deliberately have no
 * entry here -- an unmapped type must leave `kind` at its default and be
 * reported unfilled, never filed as `'0'` (TV). This is non-negotiable #6.
 */
export const METADATA_LOOKUP_KIND_MAP: Readonly<Record<string, string>> = {
  TV: '0',
  Movie: '1',
  Special: '2',
  OVA: '3',
};

/**
 * How many placeholder rows the lookup modal's loading skeleton renders
 * (design D8), mirroring the row count of sibling list skeletons in this
 * repository (e.g. `HISTORY_TABLE_SKELETON_ROW_COUNT`).
 */
export const METADATA_LOOKUP_SKELETON_ROW_COUNT = 5;

/**
 * MyAnimeList's literal `Episodes:` text for an anime that has not aired
 * long enough to report a count -- a legitimate absence, not a parse
 * failure (design's Field Mapping table). `internal/myanimelist/detail.go`
 * already treats this literal as absence and never lets it reach the
 * frontend as `episodes`; `toAnimeMetadataSelection` still checks for it as
 * defense in depth.
 */
export const METADATA_LOOKUP_EPISODES_UNKNOWN_LITERAL = 'Unknown';
