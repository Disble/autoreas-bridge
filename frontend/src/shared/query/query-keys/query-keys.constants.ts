import { defineQueryKeys } from './query-keys.helpers';

// Each migrated context's key factory lives here, in `shared/query`, because the
// invalidation rules in `bridge-runtime.constants.ts` name its prefix and shared
// code cannot import features (ADR-032 §4).

/**
 * Keys of the episodes module's reads (Today): `episodesKeys.key('schedule', day)`
 * and `episodesKeys.key('day-counts')`; `episodesKeys.all` is their common prefix.
 */
export const episodesKeys = defineQueryKeys('episodes');
