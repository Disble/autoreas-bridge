import { Skeleton } from '@heroui/react';
import { SYNCING_ANIME_PANEL_CARD_CLASS, SYNCING_ANIME_PANEL_SKELETON_CARD_COUNT } from './syncing-anime-panel.constants';

/**
 * Placeholder cards shown while the pending anime queue is unresolved.
 * Mirrors the resolved card grid — a title and progress line on the left,
 * two chip-sized pills on the right — sharing its card class so the grid
 * does not resize once real cards arrive.
 */
export function SyncingAnimeSkeleton() {
  return (
    <div className="grid max-h-[28rem] grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
      {Array.from({ length: SYNCING_ANIME_PANEL_SKELETON_CARD_COUNT }, (_unused, index) => (
        <article className={SYNCING_ANIME_PANEL_CARD_CLASS} data-testid="syncing-anime-skeleton-card" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5 rounded" />
              <Skeleton className="h-3 w-2/5 rounded" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="mt-3 h-3 w-1/3 rounded" />
        </article>
      ))}
    </div>
  );
}
