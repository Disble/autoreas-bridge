import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { ANIME_CHANGED_EVENT_NAME } from '../../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import { ANIME_LIST_KEY, animeEditorKeys, animeKeys, episodesKeys } from '../../query-keys/query-keys.constants';
import { connectBridgeEvents } from '../../test-support/bridge-modules.test-support';

/** The anime reads a committed anime change makes stale, one cached query per prefix. */
const STALE_ON_ANIME_CHANGE = [
  episodesKeys.key('schedule', 'Lunes'),
  ANIME_LIST_KEY,
  animeKeys.key('detail', 'anime-a'),
  animeKeys.key('watch-history', { limit: 30 }),
  animeKeys.key('anime-watch-history', { animeId: 'anime-a', limit: 30 }),
] as const;

/** The reads an anime change leaves alone: covers (one per anime on screen) and the Editor's drafted record. */
const KEPT_ON_ANIME_CHANGE = [animeKeys.key('cover', 'anime-a'), animeEditorKeys.key('record', 'anime-a')] as const;

/**
 * Builds a client caching one settled query under each key.
 * @param keys The query keys to cache.
 * @returns The client.
 */
function clientCaching(keys: readonly (readonly unknown[])[]): QueryClient {
  const client = new QueryClient();
  keys.forEach((key) => client.setQueryData(key, ['row']));
  return client;
}

describe('BRIDGE_INVALIDATIONS anime.changed rule', () => {
  it('marks the episodes, list, detail and watch-history reads stale, never the covers or the Editor record', () => {
    const client = clientCaching([...STALE_ON_ANIME_CHANGE, ...KEPT_ON_ANIME_CHANGE]);
    const { emit, disconnect } = connectBridgeEvents(client);

    emit(ANIME_CHANGED_EVENT_NAME);

    STALE_ON_ANIME_CHANGE.forEach((key) => expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true));
    KEPT_ON_ANIME_CHANGE.forEach((key) => expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false));
    disconnect();
  });
});
