import { Card } from '@heroui/react';
import { AnimeDetailCover } from './AnimeDetailCover';
import { AnimeDetailGeneralData } from './AnimeDetailGeneralData';
import { AnimeDetailIdentity } from './AnimeDetailIdentity';
import { AnimeDetailToolbar } from './AnimeDetailToolbar';
import { ANIME_DETAIL_BODY_CLASS, ANIME_DETAIL_COVER_FRAME_CLASS, ANIME_DETAIL_GRID_CLASS, ANIME_DETAIL_TITLE_ID } from './anime-detail.constants';
import type { AnimeDetailMainCardProps } from './anime-detail.types';

/**
 * The main card, laid out from its own width: the toolbar, then the cover
 * beside the identity and General data. Its content is the `@container`
 * every breakpoint in the grid, cover and field classes measures.
 */
export function AnimeDetailMainCard(props: Readonly<AnimeDetailMainCardProps>) {
  const { cover, detail, onCopyFolder, onOpenPage, onPortadaError, onPortadaLoad } = props;

  return (
    <Card aria-labelledby={ANIME_DETAIL_TITLE_ID} data-testid="anime-detail-main-card">
      <Card.Content className="@container flex flex-col gap-3">
        <AnimeDetailToolbar
          detail={detail}
          isMutating={props.isMutating}
          onBack={props.onBack}
          onEditAnime={props.onEditAnime}
          onRequestRepeat={props.onRequestRepeat}
          onRequestRestore={props.onRequestRestore}
        />
        <div className={ANIME_DETAIL_GRID_CLASS}>
          <div className={ANIME_DETAIL_COVER_FRAME_CLASS}>
            <AnimeDetailCover cover={cover} coverAlt={detail.coverAlt} onPortadaError={onPortadaError} onPortadaLoad={onPortadaLoad} />
          </div>
          <div className={ANIME_DETAIL_BODY_CLASS}>
            <AnimeDetailIdentity detail={detail} />
            <AnimeDetailGeneralData detail={detail} onCopyFolder={onCopyFolder} onOpenPage={onOpenPage} />
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
