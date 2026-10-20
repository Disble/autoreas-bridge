import { Card, Skeleton } from '@heroui/react';
import {
  CATALOG_COVER_FRAME_CLASS,
  CATALOG_GRID_CLASS,
  CATALOG_LIST_ROW_CLASS,
  CATALOG_SKELETON_CARD_COUNT,
  CATALOG_SKELETON_ROW_COUNT,
} from './catalog-panel.constants';
import type { CatalogSkeletonProps } from './catalog-panel.types';

/**
 * Placeholder for the active view while the Catalog request is unresolved.
 * Cards and rows share their real counterparts' frame and row classes, so the
 * placeholder occupies the footprint of the content it stands in for.
 */
export function CatalogSkeleton({ view }: Readonly<CatalogSkeletonProps>) {
  if (view === 'grid') {
    return (
      <ul aria-hidden="true" className={CATALOG_GRID_CLASS}>
        {Array.from({ length: CATALOG_SKELETON_CARD_COUNT }, (_unused, index) => (
          <li className="flex flex-col gap-3" data-testid="catalog-skeleton-card" key={index}>
            <Skeleton className={`${CATALOG_COVER_FRAME_CLASS} rounded-xl`} />
            {/* Line boxes match the card's text: a two-line body title, a body-sm meta line and the sm chip. */}
            <span className="flex flex-col px-0.5">
              <span className="flex h-7 items-center"><Skeleton className="h-4 w-full rounded" /></span>
              <span className="flex h-7 items-center"><Skeleton className="h-4 w-3/5 rounded" /></span>
              <span className="mt-1 flex h-6 items-center"><Skeleton className="h-3 w-1/3 rounded" /></span>
              <Skeleton className="mt-2 h-5 w-16 rounded-full" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card aria-hidden="true" className="p-2">
      <ul>
        {Array.from({ length: CATALOG_SKELETON_ROW_COUNT }, (_unused, index) => (
          <li className={CATALOG_LIST_ROW_CLASS} data-testid="catalog-skeleton-row" key={index}>
            <Skeleton className={`${CATALOG_COVER_FRAME_CLASS} rounded-md`} />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/5 rounded" />
              <Skeleton className="h-3 w-2/5 rounded" />
            </span>
            <Skeleton className="col-start-2 h-6 w-20 rounded-full sm:col-start-auto" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
