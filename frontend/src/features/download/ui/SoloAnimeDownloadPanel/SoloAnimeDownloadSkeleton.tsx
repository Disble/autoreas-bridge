import { cn, Skeleton } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_ROW_CLASS, SOLO_ANIME_DOWNLOAD_SKELETON_ROW_COUNT } from './solo-anime-download-panel.constants';

/**
 * Placeholder rows shown while the readiness query is unresolved. Mirrors
 * the resolved row's shape — a name bar on the left, a status-tag bar on
 * the right — sharing its row geometry so the rail does not jump once the
 * real rows arrive.
 */
export function SoloAnimeDownloadSkeleton() {
  return (
    <>
      {Array.from({ length: SOLO_ANIME_DOWNLOAD_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div
          className={cn(SOLO_ANIME_DOWNLOAD_ROW_CLASS, 'flex items-center border-transparent bg-transparent')}
          data-testid="solo-anime-download-skeleton-row"
          key={index}
        >
          <Skeleton className="h-3.5 w-2/5 rounded" />
          <Skeleton className="h-3 w-16 shrink-0 rounded" />
        </div>
      ))}
    </>
  );
}
