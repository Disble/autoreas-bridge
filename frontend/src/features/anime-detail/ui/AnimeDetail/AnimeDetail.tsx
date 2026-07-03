import { Card, Chip } from '@heroui/react';
import {
  ANIME_DETAIL_LOADING_MESSAGE,
  ANIME_DETAIL_NOT_FOUND_MESSAGE,
  ANIME_DETAIL_NO_REPETITIONS_MESSAGE,
} from './anime-detail.constants';
import type { AnimeDetailProps } from './anime-detail.types';
import { useAnimeDetail } from './use-anime-detail';

/** Shared, read-only detail view reachable by id from both Catalog and History. */
export function AnimeDetail(props: Readonly<AnimeDetailProps>) {
  const { loadState, detail } = useAnimeDetail(props);

  if (loadState === 'not-found') {
    return <p className="text-sm text-muted">{ANIME_DETAIL_NOT_FOUND_MESSAGE}</p>;
  }

  if (loadState === 'loading' || detail === undefined) {
    return <p className="text-sm text-muted">{ANIME_DETAIL_LOADING_MESSAGE}</p>;
  }

  return (
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-4">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{detail.nombre}</h2>
          <p className="text-sm text-muted">{detail.progressLabel}</p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {detail.isFirstWatch ? (
            <Chip color="success" size="sm" variant="soft">
              <Chip.Label>First watch</Chip.Label>
            </Chip>
          ) : null}
          {detail.genres.map((genre) => (
            <Chip color="default" key={genre} size="sm" variant="soft">
              <Chip.Label>{genre}</Chip.Label>
            </Chip>
          ))}
        </div>

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Studios</dt>
            <dd className="text-foreground">{detail.studios}</dd>
          </div>
          <div>
            <dt className="text-muted">Origin</dt>
            <dd className="text-foreground">{detail.origin}</dd>
          </div>
        </dl>

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
