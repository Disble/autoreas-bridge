import { Alert, Skeleton } from '@heroui/react';
import historyAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { formatDayHeading, formatRowTime } from '../../../../shared/watch-history/watch-history.helpers';
import {
  ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION,
  ANIME_WATCH_HISTORY_EMPTY_TITLE,
  ANIME_WATCH_HISTORY_ERROR_TITLE,
  ANIME_WATCH_HISTORY_LABEL,
  ANIME_WATCH_HISTORY_LOADING_LABEL,
  ANIME_WATCH_HISTORY_ROW_CLASS,
  ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT,
  ANIME_WATCH_HISTORY_TRUNCATED_NOTICE,
} from './anime-watch-history.constants';
import type { AnimeWatchHistoryProps } from './anime-watch-history.types';
import { useAnimeWatchHistory } from './use-anime-watch-history';

/**
 * Per-anime episode-history section rendered beside AnimeRepetitionTimeline
 * (watch-history spec, "Per-Anime History Surfaces On Anime Detail"): lists
 * this anime's own recorded episode-watch rows, most recent page only -- no
 * scroll-triggered paging is wired here (unlike the global HistoryTimeline).
 * The backend still caps page size, so a longer log renders
 * `ANIME_WATCH_HISTORY_TRUNCATED_NOTICE` under the list rather than silently
 * dropping older rows. Renders exactly one of three exclusive states
 * (CLAUDE.md FE #14): a row-shaped skeleton while unresolved, the surface
 * error Alert on failure, or AirisEmptyState when resolved with zero rows.
 * Owns its data via useAnimeWatchHistory.
 */
export function AnimeWatchHistory(props: Readonly<AnimeWatchHistoryProps>) {
  const { entries, isLoading, hasMore, error } = useAnimeWatchHistory(props.animeId);
  const isEmpty = !isLoading && error === undefined && entries.length === 0;

  return (
    <section aria-label={ANIME_WATCH_HISTORY_LABEL} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{ANIME_WATCH_HISTORY_LABEL}</h3>

      {isLoading ? (
        <div
          aria-labelledby="anime-watch-history-loading-label"
          aria-live="polite"
          className="flex flex-col gap-2"
          role="status"
        >
          <span className="sr-only" id="anime-watch-history-loading-label">
            {ANIME_WATCH_HISTORY_LOADING_LABEL}
          </span>
          {Array.from({ length: ANIME_WATCH_HISTORY_SKELETON_ROW_COUNT }, (_unused, index) => (
            <div className={ANIME_WATCH_HISTORY_ROW_CLASS} data-testid="anime-watch-history-skeleton-row" key={index}>
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
          description={ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION}
          imageSrc={historyAirisArtwork}
          title={ANIME_WATCH_HISTORY_EMPTY_TITLE}
        />
      ) : null}

      {isLoading || error !== undefined || isEmpty
        ? null
        : (
          <>
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => (
                <li className={ANIME_WATCH_HISTORY_ROW_CLASS} key={entry.id}>
                  <span className="text-foreground">Episode {entry.episode}</span>
                  <span className="text-xs text-muted">
                    {formatDayHeading(entry.watchedAtMs)}, {formatRowTime(entry.watchedAtMs)}
                  </span>
                </li>
              ))}
            </ul>
            {hasMore ? <p className="text-xs text-muted">{ANIME_WATCH_HISTORY_TRUNCATED_NOTICE}</p> : null}
          </>
        )}
    </section>
  );
}
