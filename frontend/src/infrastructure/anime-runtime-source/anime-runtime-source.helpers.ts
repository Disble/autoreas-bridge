import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { AnimeChangedNotice } from '../../shared/contracts/anime.types';
import { createRuntimeSubscription } from '../wails-bindings.helpers';
import { ANIME_CHANGED_EVENT_NAME, ANIME_RUNTIME_SOURCE_STATE } from './anime-runtime-source.constants';
import type { AnimeRuntimeSource } from './anime-runtime-source.types';

/**
 * Creates the singleton runtime-backed anime source that pushes
 * `anime.changed` events. Shares one Wails listener across every consumer
 * (`createRuntimeSubscription`) and degrades to a no-op subscription (never
 * throws, never invokes the listener) when the Wails runtime bindings are not
 * attached.
 */
export function createAnimeRuntimeSource(): AnimeRuntimeSource {
  if (ANIME_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return ANIME_RUNTIME_SOURCE_STATE.sharedSource;
  }

  const animeSubscription = createRuntimeSubscription<AnimeChangedNotice>((emit) => {
    return EventsOn(ANIME_CHANGED_EVENT_NAME, (notice: AnimeChangedNotice) => emit(notice));
  });

  ANIME_RUNTIME_SOURCE_STATE.sharedSource = {
    subscribeAnimeChanges(listener) {
      return animeSubscription.subscribe(listener);
    },
  };

  return ANIME_RUNTIME_SOURCE_STATE.sharedSource;
}

/** Shared anime runtime source singleton used across hooks and stores. */
export const animeRuntimeSource = createAnimeRuntimeSource();
