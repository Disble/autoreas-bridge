import { Chip } from '@heroui/react';
import {
  ANIME_DETAIL_REPETITION_CREATED_LABEL,
  ANIME_DETAIL_REPETITION_DELETED_LABEL,
  ANIME_DETAIL_REPETITION_EPISODES_LABEL,
  ANIME_DETAIL_REPETITION_LAST_WATCHED_LABEL,
  ANIME_DETAIL_REPETITION_NEXT_LABEL,
  ANIME_DETAIL_REPETITION_PREMIERE_LABEL,
} from './anime-detail.constants';
import type { AnimeRepetitionTimelineProps } from './anime-detail.types';

/**
 * Dumb left-rail timeline for an anime's repetition history (Anime Detail
 * delta spec, "Repetition entry shows the full Legacy record"). Renders
 * entries in the order given by the caller -- ordering is the view model's
 * responsibility (`sortAnimeRepeticionesMostRecentFirst`), not this
 * component's.
 */
export function AnimeRepetitionTimeline(props: Readonly<AnimeRepetitionTimelineProps>) {
  return (
    <ol className="relative flex flex-col gap-4 border-l border-white/10 pl-4">
      {props.repetitions.map((entry) => (
        <li className="relative" key={entry.key}>
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Repetition {entry.numRepeticion}</span>
            <Chip color={entry.estadoColor} size="sm" variant="soft">
              <Chip.Label>{entry.estadoLabel}</Chip.Label>
            </Chip>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_EPISODES_LABEL}</dt>
              <dd className="text-foreground">{entry.episodesWatchedLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_CREATED_LABEL}</dt>
              <dd className="text-foreground">{entry.creacionLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_PREMIERE_LABEL}</dt>
              <dd className="text-foreground">{entry.estrenoLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_LAST_WATCHED_LABEL}</dt>
              <dd className="text-foreground">{entry.ultCapVistoLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_DELETED_LABEL}</dt>
              <dd className="text-foreground">{entry.eliminacionLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">{ANIME_DETAIL_REPETITION_NEXT_LABEL}</dt>
              <dd className="text-foreground">{entry.repeatedOnLabel}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
