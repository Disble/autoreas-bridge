/**
 * Query `meta` key under which `useBridgeQuery` records the module a gated
 * query waits on, so the provider can re-run that module's failed queries
 * when it settles.
 */
export const GATED_MODULE_META_KEY = 'bridgeReadinessModule';
