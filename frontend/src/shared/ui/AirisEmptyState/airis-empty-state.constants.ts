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
