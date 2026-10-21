import { Skeleton } from '@heroui/react';
import { NoCoverPoster } from '../../../../shared/anime-cover/NoCoverPoster/NoCoverPoster';
import { CATALOG_NO_COVER_LABEL } from './catalog-panel.constants';
import type { CatalogCoverSlotProps } from './catalog-panel.types';

/**
 * Fills a Catalog cover frame: a skeleton while the lookup is pending, the
 * resolved art, or the Airis "No Cover" poster. Every branch fills the frame
 * edge to edge, so the frame's 230:326 ratio alone decides the card height.
 */
export function CatalogCoverSlot({ animeId, cover, size, onCoverError }: Readonly<CatalogCoverSlotProps>) {
  if (cover.status === 'loading') {
    return <Skeleton className="size-full rounded-none" data-testid="catalog-cover-loading" />;
  }

  if (cover.status === 'cover') {
    return <img alt="" className="size-full object-cover" decoding="async" src={cover.src} onError={() => onCoverError(animeId)} />;
  }

  return <NoCoverPoster label={CATALOG_NO_COVER_LABEL} showLabel={size === 'card'} />;
}
