import { Skeleton } from '@heroui/react';
import {
  ANIME_WATCH_HISTORY_LOADING_LABEL,
  ANIME_WATCH_HISTORY_ROW_CLASS,
  ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT,
  ANIME_WATCH_HISTORY_TAGGED_ROW_CLASS,
} from './anime-watch-history.constants';
import type { AnimeWatchEpisodeListSkeletonProps } from './anime-watch-episode-list.types';

/**
 * Loading placeholder of one episode list, announced through a named status
 * region (CLAUDE.md FE #14). Each placeholder row shares the real row's shape
 * class, including the chip column when the list is tagged.
 */
export function AnimeWatchEpisodeListSkeleton({ isTagged }: Readonly<AnimeWatchEpisodeListSkeletonProps>) {
  const rowClass = isTagged ? ANIME_WATCH_HISTORY_TAGGED_ROW_CLASS : ANIME_WATCH_HISTORY_ROW_CLASS;

  return (
    <div aria-labelledby="anime-watch-episode-list-loading-label" aria-live="polite" className="flex flex-col gap-1" role="status">
      <span className="sr-only" id="anime-watch-episode-list-loading-label">
        {ANIME_WATCH_HISTORY_LOADING_LABEL}
      </span>
      {Array.from({ length: ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div className={rowClass} data-testid="anime-watch-episode-list-skeleton-row" key={index}>
          <Skeleton className="h-4 w-24 rounded" />
          {isTagged ? <Skeleton className="h-5 w-16 rounded-2xl" /> : null}
          <Skeleton className="h-3 w-24 justify-self-end rounded" />
        </div>
      ))}
    </div>
  );
}
