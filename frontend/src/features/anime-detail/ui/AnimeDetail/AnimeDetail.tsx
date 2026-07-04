import { Card, Chip, ProgressBar } from '@heroui/react';
import {
  ANIME_DETAIL_LOADING_MESSAGE,
  ANIME_DETAIL_NOT_FOUND_MESSAGE,
  ANIME_DETAIL_NO_GENEROS_MESSAGE,
  ANIME_DETAIL_NO_PAGINA_MESSAGE,
  ANIME_DETAIL_NO_REPETITIONS_MESSAGE,
  ANIME_DETAIL_PORTADA_ALT,
  ANIME_DETAIL_PROGRESS_LABEL,
} from './anime-detail.constants';
import type { AnimeDetailProps } from './anime-detail.types';
import { useAnimeDetail } from './use-anime-detail';

/** Shared, read-only detail view reachable by id from both Catalog and History. */
export function AnimeDetail(props: Readonly<AnimeDetailProps>) {
  const { loadState, detail, showPortadaPlaceholder, onPortadaError } = useAnimeDetail(props);

  if (loadState === 'not-found') {
    return <p className="text-sm text-muted">{ANIME_DETAIL_NOT_FOUND_MESSAGE}</p>;
  }

  if (loadState === 'loading' || detail === undefined) {
    return <p className="text-sm text-muted">{ANIME_DETAIL_LOADING_MESSAGE}</p>;
  }

  return (
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {showPortadaPlaceholder ? (
            <div
              className="flex size-24 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-xs text-muted"
              data-testid="anime-detail-portada-placeholder"
            >
              {ANIME_DETAIL_PORTADA_ALT}
            </div>
          ) : (
            <img
              alt={ANIME_DETAIL_PORTADA_ALT}
              className="size-24 shrink-0 rounded-full object-cover"
              onError={onPortadaError}
              src={detail.portadaUrl}
            />
          )}

          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">{detail.nombre}</h2>
            <p className="text-sm text-muted">{detail.subtitleLabel}</p>
            <Chip color={detail.statusColor} size="sm" variant="soft">
              <Chip.Label>{detail.statusLabel}</Chip.Label>
            </Chip>
          </div>
        </header>

        <section aria-label="Chapter info" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Chapter info</h3>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            {detail.statTiles.map((tile) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2" key={tile.label}>
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
            <ul className="flex flex-col gap-2">
              {detail.repetitions.map((entry) => (
                <li
                  className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                  key={entry.key}
                >
                  <span className="text-foreground">Repetition {entry.numRepeticion}</span>
                  <span className="text-muted"> — {entry.progressLabel} — {entry.repeatedOnLabel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{ANIME_DETAIL_NO_REPETITIONS_MESSAGE}</p>
          )}
        </section>
      </Card.Content>
    </Card>
  );
}
