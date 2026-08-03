import type { AnimeRuntimeSource } from './anime-runtime-source.types';

/** Wails runtime event name the bridge emits once per committed anime change. */
export const ANIME_CHANGED_EVENT_NAME = 'anime.changed';

/** Module-local singleton container for the shared anime runtime source. */
export const ANIME_RUNTIME_SOURCE_STATE: { sharedSource: AnimeRuntimeSource | null } = {
  sharedSource: null,
};
