/**
 * Accessible name of the status region shown while the SQLite health read is
 * unresolved. The placeholder itself is decorative, so this wording is the only
 * thing assistive technology has to announce.
 */
export const BRIDGE_STATUS_LOADING_LABEL = 'Loading SQLite status...';

/**
 * Shape shared by the status `Chip` and its placeholder.
 *
 * The chip is `size="sm" variant="soft"`, so the placeholder is pinned to the
 * same height and corner radius; without it the row's height changes when the
 * real status lands, which is the jump a placeholder exists to prevent.
 */
export const BRIDGE_STATUS_PLACEHOLDER_CLASS = 'h-6 w-24 rounded-full';
