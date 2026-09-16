import type { AnimeMetadataLookupSource } from '../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';

/**
 * Module-local singleton container's shape for the shared metadata lookup
 * source, mirroring `PREFERENCES_SOURCE_STATE`'s own container -- `null`
 * until `createMetadataLookupSource` builds the shared instance once.
 */
export interface MetadataLookupSourceState {
  sharedSource: AnimeMetadataLookupSource | null;
}
