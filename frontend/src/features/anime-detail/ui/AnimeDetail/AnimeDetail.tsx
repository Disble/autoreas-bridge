import { Button, Card, Chip, Skeleton } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../../shared/ui/AnimeCoverPlaceholder';
import { AnimeWatchHistory } from '../AnimeWatchHistory/AnimeWatchHistory';
import { AnimeDetailMutationActions } from './AnimeDetailMutationActions';
import { AnimeDetailMutationControls } from './AnimeDetailMutationControls';
import { AnimeDetailSkeleton } from './AnimeDetailSkeleton';
import {
  ANIME_DETAIL_BACK_LABEL,
  ANIME_DETAIL_HERO_AVATAR_CLASS,
  ANIME_DETAIL_LOADING_MESSAGE,
  ANIME_DETAIL_NOT_FOUND_MESSAGE,
  ANIME_DETAIL_NO_GENEROS_MESSAGE,
  ANIME_DETAIL_NO_PAGINA_MESSAGE,
  ANIME_DETAIL_PORTADA_ALT,
  ANIME_DETAIL_PORTADA_LOADING_MESSAGE,
  ANIME_DETAIL_STAT_TILE_CLASS,
} from './anime-detail.constants';
import type { AnimeDetailProps } from './anime-detail.types';
import { useAnimeDetail } from './use-anime-detail';

/** Shared, read-only detail view reachable by id from both Catalog and History. */
export function AnimeDetail(props: Readonly<AnimeDetailProps>) {
  const {
    loadState,
    detail,
    detailSource,
    cover,
    confirmation,
    feedback,
    isMutating,
    onPortadaError,
    onPortadaLoad,
    onBack,
    onEditAnime,
    onRequestRepeat,
    onRequestRestore,
    onCancelAction,
    onConfirmationOpenChange,
    onConfirmAction,
  } = useAnimeDetail(props);

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
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-5">
        <Button className="self-start" onPress={onBack} size="sm" variant="ghost">
          {ANIME_DETAIL_BACK_LABEL}
        </Button>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          {cover.status === 'loading' ? (
            <div
              aria-labelledby="anime-detail-portada-loading-label"
              aria-live="polite"
              role="status"
            >
              <span className="sr-only" id="anime-detail-portada-loading-label">
                {ANIME_DETAIL_PORTADA_LOADING_MESSAGE}
              </span>
              <Skeleton className={ANIME_DETAIL_HERO_AVATAR_CLASS} />
            </div>
          ) : cover.status === 'cover' ? (
            <img
              alt={ANIME_DETAIL_PORTADA_ALT}
              className={`object-cover ${ANIME_DETAIL_HERO_AVATAR_CLASS}`}
              onError={onPortadaError}
              onLoad={onPortadaLoad}
              src={cover.dataUrl}
            />
          ) : (
            <div
              className={`flex items-center justify-center bg-white/[0.04] text-muted ${ANIME_DETAIL_HERO_AVATAR_CLASS}`}
              data-testid="anime-detail-portada-placeholder"
            >
              <AnimeCoverPlaceholder className="size-14" />
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-[21px] font-bold text-foreground">{detail.nombre}</h2>
            <p className="text-sm text-muted">{detail.subtitleLabel}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={detail.statusColor} size="sm" variant="soft">
                <Chip.Label>{detail.statusLabel}</Chip.Label>
              </Chip>
              <Button onPress={onEditAnime} size="sm" variant="tertiary">Edit anime</Button>
              <AnimeDetailMutationActions
                canRepeat={detail.canRepeat}
                canRestore={detail.canRestore}
                isMutating={isMutating}
                onRequestRepeat={onRequestRepeat}
                onRequestRestore={onRequestRestore}
              />
            </div>
          </div>
        </header>

        <AnimeDetailMutationControls
          confirmation={confirmation}
          detail={detail}
          feedback={feedback}
          isMutating={isMutating}
          onCancelAction={onCancelAction}
          onConfirmationOpenChange={onConfirmationOpenChange}
          onConfirmAction={onConfirmAction}
          onRequestRepeat={onRequestRepeat}
          onRequestRestore={onRequestRestore}
        />

        <section aria-label="Episode info">
          <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {detail.statTiles.map((tile) => (
              <div className={ANIME_DETAIL_STAT_TILE_CLASS} key={tile.label}>
                <dt className="text-xs text-muted">{tile.label}</dt>
                <dd className="text-[13px] text-foreground tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="General data" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">General data</h3>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Page</dt>
              <dd className="text-foreground">
                {detail.paginaUrl === undefined ? (
                  ANIME_DETAIL_NO_PAGINA_MESSAGE
                ) : (
                  <a className="text-primary underline" href={detail.paginaUrl} rel="noreferrer" target="_blank">
                    {detail.paginaUrl}
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Folder</dt>
              <dd className="text-foreground">{detail.carpetaLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Premiere date</dt>
              <dd className="text-foreground">{detail.estrenoLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Creation date</dt>
              <dd className="text-foreground">{detail.creacionLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Last episode watched</dt>
              <dd className="text-foreground">{detail.ultCapVistoLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Studios</dt>
              <dd className="text-foreground">{detail.studios}</dd>
            </div>
            <div>
              <dt className="text-muted">Origin</dt>
              <dd className="text-foreground">{detail.origin}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {detail.hasGenres ? (
              detail.genres.map((genre) => (
                <Chip color="default" key={genre} size="sm" variant="soft">
                  <Chip.Label>{genre}</Chip.Label>
                </Chip>
              ))
            ) : (
              <p className="text-sm text-muted">{ANIME_DETAIL_NO_GENEROS_MESSAGE}</p>
            )}
          </div>
        </section>

        {detailSource === undefined || detailSource === null ? null : (
          <AnimeWatchHistory animeId={props.animeId} detail={detailSource} />
        )}

      </Card.Content>
    </Card>
  );
}
