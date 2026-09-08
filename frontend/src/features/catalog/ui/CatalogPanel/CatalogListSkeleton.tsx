import { Skeleton } from '@heroui/react';
import { CATALOG_LIST_ROW_CLASS, CATALOG_SKELETON_ROW_COUNT } from './catalog-panel.constants';

/**
 * Placeholder rows shown while the Catalog request is unresolved. Mirrors
 * `CatalogListRow`'s shape — a title bar, a shorter subtitle bar, and two
 * chip-sized pills — sharing its row class so the placeholder occupies the
 * same footprint as the real row it stands in for.
 */
export function CatalogListSkeleton() {
  return (
    <>
      {Array.from({ length: CATALOG_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div className={CATALOG_LIST_ROW_CLASS} data-testid="catalog-skeleton-row" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-3/5 rounded" />
              <Skeleton className="mt-2 h-3 w-2/5 rounded" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
