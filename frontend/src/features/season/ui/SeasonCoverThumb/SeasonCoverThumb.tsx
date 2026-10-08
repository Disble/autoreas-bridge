import { Skeleton } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../../shared/ui/AnimeCoverPlaceholder';
import type { SeasonCoverThumbProps } from './season-cover-thumb.types';

/**
 * The 44px rounded cover slot a season row renders beside the anime's name,
 * matching the Editor library row: the image, a skeleton while it resolves, or
 * the shared placeholder. Every state is decorative (empty `alt`,
 * `aria-hidden`) because the row's own visible name already labels it, and one
 * live region per row would repeat the board's state for every anime. The slot
 * is fixed-size, so a cover's own aspect ratio cannot change the row's height.
 */
export function SeasonCoverThumb({ coverSrc, isLoading }: Readonly<SeasonCoverThumbProps>) {
  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-lg" data-testid="season-cover-thumb">
      {coverSrc !== undefined ? (
        <img alt="" className="size-full object-cover" data-testid="season-cover-thumb-image" src={coverSrc} />
      ) : isLoading ? (
        <Skeleton aria-hidden="true" className="size-full" data-testid="season-cover-thumb-loading" />
      ) : (
        <AnimeCoverPlaceholder aria-hidden="true" className="size-full text-muted" data-testid="season-cover-thumb-placeholder" />
      )}
    </div>
  );
}
