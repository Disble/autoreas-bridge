import { Button, Card, Chip, ProgressBar } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../../shared/ui/AnimeCoverPlaceholder';
import { AnimeDetailMutationControls } from './AnimeDetailMutationControls';
import { AnimeDetailSkeleton } from './AnimeDetailSkeleton';
import { AnimeRepetitionTimeline } from './AnimeRepetitionTimeline';
import {
  ANIME_DETAIL_BACK_LABEL,
  ANIME_DETAIL_HERO_AVATAR_CLASS,
  ANIME_DETAIL_LOADING_MESSAGE,
  ANIME_DETAIL_NOT_FOUND_MESSAGE,
  ANIME_DETAIL_NO_GENEROS_MESSAGE,
  ANIME_DETAIL_NO_PAGINA_MESSAGE,
  ANIME_DETAIL_NO_REPETITIONS_MESSAGE,
  ANIME_DETAIL_PORTADA_ALT,
  ANIME_DETAIL_PROGRESS_LABEL,
  ANIME_DETAIL_STAT_TILE_CLASS,
} from './anime-detail.constants';
import type { AnimeDetailProps } from './anime-detail.types';
import { useAnimeDetail } from './use-anime-detail';

/** Shared, read-only detail view reachable by id from both Catalog and History. */
export function AnimeDetail(props: Readonly<AnimeDetailProps>) {
  const {
    loadState,
    detail,
    showPortadaPlaceholder,
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
      <Card.Content className="flex flex-col gap-6">
        <Button className="self-start" onPress={onBack} variant="ghost">
          {ANIME_DETAIL_BACK_LABEL}
        </Button>

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {showPortadaPlaceholder ? (
            <div
              className={`flex items-center justify-center bg-white/[0.04] text-muted ${ANIME_DETAIL_HERO_AVATAR_CLASS}`}
              data-testid="anime-detail-portada-placeholder"
            >
              <AnimeCoverPlaceholder className="size-16" />
            </div>
          ) : (
            <img
              alt={ANIME_DETAIL_PORTADA_ALT}
              className={`object-cover ${ANIME_DETAIL_HERO_AVATAR_CLASS}`}
              onError={onPortadaError}
              onLoad={onPortadaLoad}
              src={detail.portadaUrl}
            />
          )}

          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">{detail.nombre}</h2>
            <p className="text-sm text-muted">{detail.subtitleLabel}</p>
            <Chip color={detail.statusColor} size="sm" variant="soft">
              <Chip.Label>{detail.statusLabel}</Chip.Label>
            </Chip>
            <div className="pt-2">
              <Button onPress={onEditAnime} size="sm" variant="secondary">Edit anime</Button>
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

        <section aria-label="Episode info" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Episode info</h3>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            {detail.statTiles.map((tile) => (
              <div className={ANIME_DETAIL_STAT_TILE_CLASS} key={tile.label}>
                <dt className="text-muted">{tile.label}</dt>
                <dd className="text-foreground">{tile.value}</dd>
              </div>
            ))}
          </div>
          {detail.progressRatio === undefined ? null : (
            <ProgressBar aria-label={ANIME_DETAIL_PROGRESS_LABEL} value={detail.progressRatio}>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          )}
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

        <section aria-label="Repetition history" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Repetition history</h3>
          {detail.hasRepetitionHistory ? (
            <AnimeRepetitionTimeline repetitions={detail.repetitions} />
          ) : (
            <p className="text-sm text-muted">{ANIME_DETAIL_NO_REPETITIONS_MESSAGE}</p>
          )}
        </section>

      </Card.Content>
    </Card>
  );
}
