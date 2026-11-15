/**
 * Retries a query gets after an `unavailable` failure. A query that names its
 * module already waits on the readiness gate, so `unavailable` only reaches an
 * ungated query or a race at startup; four retries (500 + 1000 + 2000 + 4000 ms,
 * 7.5 s in all) outlast a normal startup without spinning forever on a module
 * that never comes up.
 */
export const UNAVAILABLE_RETRY_LIMIT = 4;

/** First retry delay after an `unavailable` failure; each retry doubles it. */
export const RETRY_BASE_DELAY_MS = 500;

/** Cap of the doubling retry delay. */
export const RETRY_MAX_DELAY_MS = 4000;
