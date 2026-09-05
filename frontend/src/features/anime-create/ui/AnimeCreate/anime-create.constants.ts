/** Minimum number of batch-create rows a caller may keep (removal stops here). */
export const ANIME_CREATE_MIN_ROWS = 1;

/** Sentinel unset value for optional row fields. */
export const ANIME_CREATE_UNSET_FIELD = '';

/** Default anime `tipo` for a fresh row: `'0'` = Anime (TV), preselected like Legacy. */
export const ANIME_CREATE_DEFAULT_KIND = '0';

/** Feedback shown when the create runtime binding is unavailable. */
export const ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE = 'The create runtime is unavailable.';

/** Cover source options (external URL vs on-disk image), mirroring the editor. */
export const ANIME_CREATE_COVER_TYPE_OPTIONS = [
  { value: 'url', label: 'URL' },
  { value: 'image', label: 'Image' },
] as const;

/**
 * How long the name field settles before it is checked against the catalogue.
 * The check is local (the catalogue is loaded once at mount), so this exists to
 * keep the message from flickering mid-word, not to spare a round trip.
 */
export const ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS = 300;
