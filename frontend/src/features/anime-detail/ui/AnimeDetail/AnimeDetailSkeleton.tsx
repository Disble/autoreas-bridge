import { Card, Skeleton } from '@heroui/react';
import {
  ANIME_DETAIL_BODY_CLASS,
  ANIME_DETAIL_COVER_FRAME_CLASS,
  ANIME_DETAIL_FIELD_COUNT,
  ANIME_DETAIL_FIELD_GRID_CLASS,
  ANIME_DETAIL_GENERAL_DATA_CLASS,
  ANIME_DETAIL_GRID_CLASS,
} from './anime-detail.constants';
import type { AnimeDetailSkeletonProps } from './anime-detail.types';

/**
 * Placeholder shown while Anime Detail's request is unresolved. Mirrors the
 * resolved composition — the toolbar row, the cover frame beside the
 * identity lines, the General data fields, and the Watch history card below —
 * sharing the grid, frame and field classes with the resolved card so the two
 * shapes cannot drift apart.
 */
export function AnimeDetailSkeleton({ className }: Readonly<AnimeDetailSkeletonProps>) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        <Card>
          <Card.Content className="@container flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <div className={ANIME_DETAIL_GRID_CLASS}>
              <div className={ANIME_DETAIL_COVER_FRAME_CLASS} data-testid="anime-detail-skeleton-cover">
                <Skeleton className="absolute inset-0 size-full rounded-none" />
              </div>
              <div className={ANIME_DETAIL_BODY_CLASS}>
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-7 w-56 max-w-full rounded" />
                  <Skeleton className="h-5 w-48 max-w-full rounded" />
                  <Skeleton className="mt-2 h-6 w-40 rounded" />
                  <Skeleton className="h-1 w-full rounded-full" />
                </div>
                <div className={ANIME_DETAIL_GENERAL_DATA_CLASS}>
                  <Skeleton className="mb-3 h-3 w-24 rounded" />
                  <div className={ANIME_DETAIL_FIELD_GRID_CLASS}>
                    {Array.from({ length: ANIME_DETAIL_FIELD_COUNT }, (_unused, index) => (
                      <div className={index < 2 ? 'col-span-full flex flex-col gap-1' : 'flex flex-col gap-1'} data-testid="anime-detail-skeleton-field" key={index}>
                        <Skeleton className="h-3 w-16 rounded" />
                        <Skeleton className="h-5 w-full max-w-40 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
        <Card className="mt-3">
          <Card.Content className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
