/**
 * Delays, in ms, between `GetReadiness()` re-reads while a query waits on a
 * `starting` module; the last one repeats until nothing waits. The re-sync
 * covers a `bridge.readiness` event that never reached the gate; it is not a
 * timeout: the backend guarantees no module stays `starting` forever. The same
 * delays space the retries of a first snapshot that failed, until one loads.
 */
export const READINESS_RESYNC_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];
