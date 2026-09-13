import { Alert, Chip, Skeleton } from '@heroui/react';
import historyAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { formatRowDateTime } from '../../../../shared/watch-history/watch-history.helpers';
import {
  ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION,
  ANIME_WATCH_HISTORY_EMPTY_TITLE,
  ANIME_WATCH_HISTORY_ERROR_TITLE,
  ANIME_WATCH_HISTORY_LOADING_LABEL,
  ANIME_WATCH_HISTORY_ROW_CLASS,
  ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT,
  ANIME_WATCH_HISTORY_UNRECORDED_DESCRIPTION,
  ANIME_WATCH_HISTORY_UNRECORDED_TITLE,
} from './anime-watch-history.constants';
import { ANIME_WATCH_EPISODE_LIST_SCROLL_TESTID, ANIME_WATCH_EPISODE_ROW_TESTID } from './anime-watch-episode-list.constants';
import type { AnimeWatchEpisodeListProps } from './anime-watch-episode-list.types';
import { useAnimeWatchEpisodes } from './use-anime-watch-episodes';

/**
 * Flat per-anime episode list: every recorded episode newest-first, each row
 * showing "Episode N", a "Watch K" chip, and its date and time together. The
 * chip names the scoping cycle inside a By-watch Accordion item, or the row's
 * own stored cycle in the unscoped All-episodes list (spec, "All Episodes
 * Lists Every Recorded Episode With Its Watch"). Pages progressively
 * inside its own bounded scroll container (spec, "Long Lists Page
 * Progressively"): a near-bottom scroll appends the next keyset page, so no
 * truncated-page notice ever renders. Renders exactly one of three exclusive
 * states (CLAUDE.md FE #14): a row-shaped skeleton while unresolved, the
 * surface error Alert on failure, or the empty state when resolved with zero
 * rows (a post-log past watch with zero rows states the episodes were not
 * recorded instead). Owns its data via useAnimeWatchEpisodes. Mounted by the
 * Watch history tabs, once per expanded Accordion item and once for the flat
 * All-episodes tab.
 */
export function AnimeWatchEpisodeList(props: Readonly<AnimeWatchEpisodeListProps>) {
  const { entries, isLoading, error, onScroll } = useAnimeWatchEpisodes(
    props.animeId,
    props.cycle ?? 0,
    props.enabled ?? true,
  );
  const isEmpty = !isLoading && error === undefined && entries.length === 0;

  return (
    <div
      className="flex max-h-96 flex-col gap-1 overflow-y-auto"
      data-testid={ANIME_WATCH_EPISODE_LIST_SCROLL_TESTID}
      onScroll={onScroll}
    >
      {isLoading ? (
        <div
          aria-labelledby="anime-watch-episode-list-loading-label"
          aria-live="polite"
          className="flex flex-col gap-2"
          role="status"
        >
          <span className="sr-only" id="anime-watch-episode-list-loading-label">
            {ANIME_WATCH_HISTORY_LOADING_LABEL}
          </span>
          {Array.from({ length: ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT }, (_unused, index) => (
            <div className={ANIME_WATCH_HISTORY_ROW_CLASS} data-testid="anime-watch-episode-list-skeleton-row" key={index}>
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : null}

      {error === undefined ? null : (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{ANIME_WATCH_HISTORY_ERROR_TITLE}</Alert.Title>
            <Alert.Description>{error.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {isEmpty ? (
        <AirisEmptyState
          description={props.isPastWatch === true ? ANIME_WATCH_HISTORY_UNRECORDED_DESCRIPTION : ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION}
          imageSrc={historyAirisArtwork}
          title={props.isPastWatch === true ? ANIME_WATCH_HISTORY_UNRECORDED_TITLE : ANIME_WATCH_HISTORY_EMPTY_TITLE}
        />
      ) : null}

      {isLoading || error !== undefined || isEmpty
        ? null
        : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li className={ANIME_WATCH_HISTORY_ROW_CLASS} data-testid={ANIME_WATCH_EPISODE_ROW_TESTID} key={entry.id}>
                <span className="text-foreground">Episode {entry.episode}</span>
                <Chip color="default" size="sm" variant="soft">
                  <Chip.Label>Watch {props.cycle ?? entry.cycle}</Chip.Label>
                </Chip>
                <span className="text-xs text-muted">{formatRowDateTime(entry.watchedAtMs)}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
