import { Card } from '@heroui/react';
import { AnimeWatchHistory } from '../AnimeWatchHistory/AnimeWatchHistory';
import { AnimeDetailMainCard } from './AnimeDetailMainCard';
import { AnimeDetailMutationControls } from './AnimeDetailMutationControls';
import { AnimeDetailSkeleton } from './AnimeDetailSkeleton';
import { ANIME_DETAIL_LOADING_MESSAGE, ANIME_DETAIL_NOT_FOUND_MESSAGE } from './anime-detail.constants';
import type { AnimeDetailProps } from './anime-detail.types';
import { useAnimeDetail } from './use-anime-detail';

/**
 * Shared detail view reachable by id from both Catalog and History: mutation
 * feedback, the main card (toolbar, cover, identity, General data), then
 * Watch history in its own card below.
 */
export function AnimeDetail(props: Readonly<AnimeDetailProps>) {
  const state = useAnimeDetail(props);
  const { detail, detailSource, loadState } = state;

  if (loadState === 'not-found') {
    return <p className="text-sm text-muted">{ANIME_DETAIL_NOT_FOUND_MESSAGE}</p>;
  }

  if (loadState === 'loading' || detail === undefined) {
    return (
      <div aria-labelledby="anime-detail-loading-label" aria-live="polite" role="status">
        <span className="sr-only" id="anime-detail-loading-label">
          {ANIME_DETAIL_LOADING_MESSAGE}
        </span>
        <AnimeDetailSkeleton className={props.className} />
      </div>
    );
  }

  return (
    <div className={props.className}>
      <div className="flex flex-col gap-3">
        <AnimeDetailMutationControls
          confirmation={state.confirmation}
          detail={detail}
          feedback={state.feedback}
          isMutating={state.isMutating}
          onCancelAction={state.onCancelAction}
          onConfirmationOpenChange={state.onConfirmationOpenChange}
          onConfirmAction={state.onConfirmAction}
          onRequestRepeat={state.onRequestRepeat}
          onRequestRestore={state.onRequestRestore}
        />

        <AnimeDetailMainCard
          cover={state.cover}
          detail={detail}
          isMutating={state.isMutating}
          onBack={state.onBack}
          onCopyFolder={state.onCopyFolder}
          onEditAnime={state.onEditAnime}
          onOpenPage={state.onOpenPage}
          onPortadaError={state.onPortadaError}
          onPortadaLoad={state.onPortadaLoad}
          onRequestRepeat={state.onRequestRepeat}
          onRequestRestore={state.onRequestRestore}
        />

        {detailSource === undefined || detailSource === null ? null : (
          <Card className="mt-3">
            <Card.Content>
              <AnimeWatchHistory animeId={props.animeId} detail={detailSource} />
            </Card.Content>
          </Card>
        )}
      </div>
    </div>
  );
}
