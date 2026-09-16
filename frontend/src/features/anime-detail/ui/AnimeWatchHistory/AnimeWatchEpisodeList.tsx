import { Alert } from '@heroui/react';
import historyAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AnimeWatchEpisodeListSkeleton } from './AnimeWatchEpisodeListSkeleton';
import { AnimeWatchEpisodeRows } from './AnimeWatchEpisodeRows';
import {
  ANIME_WATCH_HISTORY_EMPTY_DESCRIPTION,
  ANIME_WATCH_HISTORY_EMPTY_TITLE,
  ANIME_WATCH_HISTORY_ERROR_TITLE,
  ANIME_WATCH_HISTORY_UNRECORDED_DESCRIPTION,
  ANIME_WATCH_HISTORY_UNRECORDED_TITLE,
} from './anime-watch-history.constants';
import { ANIME_WATCH_EPISODE_LIST_SCROLL_TESTID } from './anime-watch-episode-list.constants';
import type { AnimeWatchEpisodeListProps } from './anime-watch-episode-list.types';
import { useAnimeWatchEpisodes } from './use-anime-watch-episodes';

/**
 * Flat per-anime episode list: every recorded episode newest-first, each row
 * showing "Episode N" and its date and time together. Inside a By-watch
 * Accordion item every row belongs to the scoping cycle, so no chip repeats
 * it; the unscoped All-episodes list tags each row with its own stored cycle
 * as a "Watch K" chip (spec, "All Episodes Lists Every Recorded Episode With
 * Its Watch"). Pages progressively inside its own bounded scroll container
 * (spec, "Long Lists Page Progressively"): a near-bottom scroll appends the
 * next keyset page, and a hint says so while older pages remain, so no
 * truncated-page notice ever renders. Renders exactly one of three exclusive
 * states (CLAUDE.md FE #14): a row-shaped skeleton while unresolved, the
 * surface error Alert on failure, or the empty state when resolved with zero
 * rows (a post-log past watch with zero rows states the episodes were not
 * recorded instead). Owns its data via useAnimeWatchEpisodes. Mounted by the
 * Watch history tabs, once per expanded Accordion item and once for the flat
 * All-episodes tab.
 */
export function AnimeWatchEpisodeList(props: Readonly<AnimeWatchEpisodeListProps>) {
  const { entries, hasMore, isLoading, error, onScroll } = useAnimeWatchEpisodes(
    props.animeId,
    props.cycle ?? 0,
    props.enabled ?? true,
  );
  const isEmpty = !isLoading && error === undefined && entries.length === 0;
  const isTagged = props.cycle === undefined;

  return (
    <div
      className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto"
      data-testid={ANIME_WATCH_EPISODE_LIST_SCROLL_TESTID}
      onScroll={onScroll}
    >
      {isLoading ? <AnimeWatchEpisodeListSkeleton isTagged={isTagged} /> : null}

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

      {isLoading || error !== undefined || isEmpty ? null : (
        <AnimeWatchEpisodeRows entries={entries} hasMore={hasMore} isTagged={isTagged} />
      )}
    </div>
  );
}
