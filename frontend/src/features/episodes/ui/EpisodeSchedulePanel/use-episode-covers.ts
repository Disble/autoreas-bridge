import { useEffect, useRef, useState } from 'react';
import type { CoverEntry, EpisodeScheduleItem, EpisodeScheduleSource } from './episode-schedule-panel.types';

/**
 * Fetches one cover per anime that has one, at most once per session, and hands
 * back the per-anime cache the rows render from.
 *
 * Split out of `useEpisodeSchedulePanel`, which owns the schedule, the day
 * counts, the desktop commands and the push subscription besides this. Covers
 * are the only part with their own ref, their own cache and a fan-out request
 * loop, and the complexity gate scored the combined hook as one long decision
 * chain rather than the five independent ones it actually is.
 *
 * @param items The freshly loaded schedule rows.
 * @param source The schedule port the covers are fetched through.
 * @returns Cover state keyed by anime id: loading, resolved, or placeholder.
 */
export function useEpisodeCovers(
  items: readonly EpisodeScheduleItem[],
  source: EpisodeScheduleSource,
): ReadonlyMap<string, CoverEntry> {
  // 1. Refs
  const fetchedCoverIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, CoverEntry>>(new Map());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const idsToFetch = items.filter((item) => item.hasCover && !fetchedCoverIdsRef.current.has(item.animeId)).map((item) => item.animeId);

    if (idsToFetch.length === 0) {
      return;
    }

    for (const animeID of idsToFetch) {
      fetchedCoverIdsRef.current.add(animeID);
    }

    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Cover placeholders are async fetch state keyed by freshly loaded items, so the loading map must update when the fetched schedule changes.
    setCovers((previous) => withCoverEntries(previous, idsToFetch, { status: 'loading' }));

    for (const animeID of idsToFetch) {
      void source
        .getAnimeCover(animeID)
        .then((cover) => {
          const entry: CoverEntry = cover.source === 'cover' && cover.dataUrl !== undefined ? { dataUrl: cover.dataUrl, status: 'cover' } : { status: 'placeholder' };
          setCovers((previous) => withCoverEntries(previous, [animeID], entry));
        })
        .catch(() => {
          setCovers((previous) => withCoverEntries(previous, [animeID], { status: 'placeholder' }));
        });
    }
  }, [items, source]);

  return covers;
}

/**
 * Returns a copy of the cover cache with the given ids set to one entry.
 *
 * A new Map every time because the cache is state: mutating the existing one
 * would leave React comparing an object with itself and skipping the render.
 *
 * @param previous The cache being replaced.
 * @param animeIDs The ids whose entry changes.
 * @param entry The entry to store for each of them.
 * @returns The updated cache.
 */
function withCoverEntries(
  previous: ReadonlyMap<string, CoverEntry>,
  animeIDs: readonly string[],
  entry: CoverEntry,
): ReadonlyMap<string, CoverEntry> {
  const next = new Map(previous);
  for (const animeID of animeIDs) {
    next.set(animeID, entry);
  }
  return next;
}
