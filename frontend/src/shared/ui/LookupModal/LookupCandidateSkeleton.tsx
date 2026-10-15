import { Skeleton } from '@heroui/react';
import {
  LOOKUP_CANDIDATE_COVER_SLOT_CLASS,
  LOOKUP_CANDIDATE_ROW_CLASS,
  LOOKUP_SKELETON_ROW_COUNT,
} from './lookup-modal.constants';

/**
 * Placeholder rows shown while a lookup search is unresolved. Mirrors
 * `LookupCandidateRow`'s cover-plus-two-lines shape and shares its row class,
 * so the candidate list does not jump once real candidates arrive (design
 * D8). Rendered inside `LookupModal`'s own `role="status"` region -- this
 * component contributes no text of its own, which is exactly why that region
 * also carries an `sr-only` label.
 */
export function LookupCandidateSkeleton() {
  return (
    <>
      {Array.from({ length: LOOKUP_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div className={LOOKUP_CANDIDATE_ROW_CLASS} data-testid="lookup-skeleton-row" key={index}>
          <Skeleton className={LOOKUP_CANDIDATE_COVER_SLOT_CLASS} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-3/5 rounded" />
            <Skeleton className="h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
