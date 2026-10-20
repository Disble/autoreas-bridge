import { Chip, Skeleton } from '@heroui/react';
import noCoverPoster from '../../../../assets/covers/no-cover.webp';
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

  return (
    <span className="relative block size-full bg-surface-secondary">
      <img alt={CATALOG_NO_COVER_LABEL} className="size-full object-cover" decoding="async" src={noCoverPoster} />
      {size === 'card' ? (
        <Chip aria-hidden="true" className="absolute bottom-2 left-2 bg-background/75 text-foreground" color="default" size="sm" variant="soft">
          <Chip.Label>{CATALOG_NO_COVER_LABEL}</Chip.Label>
        </Chip>
      ) : null}
    </span>
  );
}
