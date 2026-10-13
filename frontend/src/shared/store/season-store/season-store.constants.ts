/**
 * Module-local runtime bridge state shared by the season matching store
 * helpers: the combined unsubscribe of the three matching lifecycle
 * subscriptions, so however many panels connect, the backend events attach
 * once. Mirrors `DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE`.
 */
export const SEASON_MATCHING_RUNTIME_STATE: {
  unsubscribe: (() => void) | null;
} = {
  unsubscribe: null,
};
