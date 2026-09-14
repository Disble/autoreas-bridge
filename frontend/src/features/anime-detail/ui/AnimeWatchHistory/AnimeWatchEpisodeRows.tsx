import { Chip } from '@heroui/react';
import { formatRowDateTime } from '../../../../shared/watch-history/watch-history.helpers';
import {
  ANIME_WATCH_HISTORY_ROW_CLASS,
  ANIME_WATCH_HISTORY_SCROLL_HINT,
  ANIME_WATCH_HISTORY_TAGGED_ROW_CLASS,
} from './anime-watch-history.constants';
import { ANIME_WATCH_EPISODE_ROW_TESTID } from './anime-watch-episode-list.constants';
import type { AnimeWatchEpisodeRowsProps } from './anime-watch-episode-list.types';

/**
 * The resolved rows of one episode list: "Episode N" beside its date and
 * time, a "Watch K" chip between them when the list is tagged (All
 * episodes), and a scroll hint while older pages remain.
 */
export function AnimeWatchEpisodeRows({ entries, hasMore, isTagged }: Readonly<AnimeWatchEpisodeRowsProps>) {
  const rowClass = isTagged ? ANIME_WATCH_HISTORY_TAGGED_ROW_CLASS : ANIME_WATCH_HISTORY_ROW_CLASS;

  return (
    <>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li className={rowClass} data-testid={ANIME_WATCH_EPISODE_ROW_TESTID} key={entry.id}>
            <span className="text-foreground">Episode {entry.episode}</span>
            {isTagged ? (
              <Chip color="warning" size="sm" variant="soft">
                <Chip.Label>Watch {entry.cycle}</Chip.Label>
              </Chip>
            ) : null}
            <span className="text-right tabular-nums text-muted">{formatRowDateTime(entry.watchedAtMs)}</span>
          </li>
        ))}
      </ul>
      {hasMore ? <p className="py-2 text-center text-xs text-muted">{ANIME_WATCH_HISTORY_SCROLL_HINT}</p> : null}
    </>
  );
}
