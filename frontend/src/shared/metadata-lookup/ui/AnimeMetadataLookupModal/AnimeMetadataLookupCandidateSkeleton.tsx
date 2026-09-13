import { Skeleton } from '@heroui/react';
import { METADATA_LOOKUP_SKELETON_ROW_COUNT } from '../../metadata-lookup.constants';
import { METADATA_LOOKUP_CANDIDATE_ROW_CLASS } from './anime-metadata-lookup.constants';

/**
 * Placeholder rows shown while a MyAnimeList search request is unresolved.
 * Mirrors `AnimeMetadataLookupCandidate`'s cover-plus-two-lines shape and
 * shares its row class, so the candidate list does not jump once real
 * candidates arrive (design D8). Rendered inside the modal's own
 * `role="status"` region -- this component contributes no text of its own,
 * which is exactly why that region also carries an `sr-only` label.
 */
export function AnimeMetadataLookupCandidateSkeleton() {
  return (
    <>
      {Array.from({ length: METADATA_LOOKUP_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div className={METADATA_LOOKUP_CANDIDATE_ROW_CLASS} data-testid="metadata-lookup-skeleton-row" key={index}>
          <Skeleton className="size-10 shrink-0 rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-3/5 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
