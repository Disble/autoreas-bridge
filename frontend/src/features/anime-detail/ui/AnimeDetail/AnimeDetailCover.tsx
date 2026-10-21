import { Skeleton } from '@heroui/react';
import { NoCoverPoster } from '../../../../shared/anime-cover/NoCoverPoster/NoCoverPoster';
import { ANIME_DETAIL_NO_COVER_LABEL, ANIME_DETAIL_PORTADA_LOADING_MESSAGE } from './anime-detail.constants';
import type { AnimeDetailCoverProps } from './anime-detail.types';

/**
 * Fills the cover frame edge to edge: a skeleton in a named status region
 * while the cover resolves, the art, or the Airis no-cover poster, whose pill
 * shows only at full size (700px container and up).
 */
export function AnimeDetailCover({ cover, coverAlt, onPortadaError, onPortadaLoad }: Readonly<AnimeDetailCoverProps>) {
  if (cover.status === 'loading') {
    return (
      <div aria-labelledby="anime-detail-portada-loading-label" aria-live="polite" className="absolute inset-0" role="status">
        <span className="sr-only" id="anime-detail-portada-loading-label">{ANIME_DETAIL_PORTADA_LOADING_MESSAGE}</span>
        <Skeleton className="size-full rounded-none" />
      </div>
    );
  }

  if (cover.status === 'cover') {
    return <img alt={coverAlt} className="absolute inset-0 size-full object-cover" src={cover.dataUrl} onError={onPortadaError} onLoad={onPortadaLoad} />;
  }

  return (
    <span className="absolute inset-0">
      <NoCoverPoster label={ANIME_DETAIL_NO_COVER_LABEL} labelClassName="bottom-3 left-3 hidden text-sm @[700px]:inline-flex" showLabel />
    </span>
  );
}
