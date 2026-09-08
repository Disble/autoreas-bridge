import { Card, Skeleton } from '@heroui/react';
import {
  ANIME_DETAIL_HERO_AVATAR_CLASS,
  ANIME_DETAIL_SKELETON_FIELD_GROUP_COUNT,
  ANIME_DETAIL_SKELETON_TILE_COUNT,
  ANIME_DETAIL_STAT_TILE_CLASS,
} from './anime-detail.constants';
import type { AnimeDetailSkeletonProps } from './anime-detail.types';

/**
 * Placeholder shown while Anime Detail's request is unresolved. Mirrors the
 * resolved composition — a back button, the hero (avatar circle plus name
 * and subtitle lines), the stat-tile row, and the three stacked field-group
 * sections (Episode info, General data, Repetition history) — sharing the
 * avatar and tile classes with the resolved content so the two shapes
 * cannot drift apart.
 */
export function AnimeDetailSkeleton({ className }: Readonly<AnimeDetailSkeletonProps>) {
  return (
    <Card className={className}>
      <Card.Content className="flex flex-col gap-6">
        <Skeleton className="h-9 w-20 rounded-lg" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Skeleton className={ANIME_DETAIL_HERO_AVATAR_CLASS} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {Array.from({ length: ANIME_DETAIL_SKELETON_TILE_COUNT }, (_unused, index) => (
            <div className={ANIME_DETAIL_STAT_TILE_CLASS} data-testid="anime-detail-skeleton-tile" key={index}>
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="mt-2 h-4 w-8 rounded" />
            </div>
          ))}
        </div>

        {Array.from({ length: ANIME_DETAIL_SKELETON_FIELD_GROUP_COUNT }, (_unused, index) => (
          <div className="flex flex-col gap-2" data-testid="anime-detail-skeleton-field-group" key={index}>
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
