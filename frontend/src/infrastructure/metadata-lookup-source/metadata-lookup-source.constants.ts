import type { MetadataLookupSourceState } from './metadata-lookup-source.types';

/** Module-local singleton container for the shared metadata lookup source. */
export const METADATA_LOOKUP_SOURCE_STATE: MetadataLookupSourceState = { sharedSource: null };

/**
 * Message surfaced through the lookup's own `'failed'` state (design D8) when
 * `SearchMyAnimeList`/`GetMyAnimeListDetail` never attach -- distinct from a
 * legitimate zero-candidate search, which is `AnimePatchOutcomeNoOp`, not this.
 */
export const METADATA_LOOKUP_SOURCE_RUNTIME_UNAVAILABLE_MESSAGE = 'The MyAnimeList lookup runtime is unavailable.';
