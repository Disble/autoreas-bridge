import type { AnimeChangedNotice } from '../../shared/contracts/anime.types';

/**
 * Push port over the bridge's `anime.changed` Wails runtime event stream.
 * The backend already fans committed anime changes out to mobile clients over
 * the realtime hub; this is the desktop leg, so panels react to writes that
 * did not originate in this window (mobile, REST API, background downloads).
 * Degrades to a no-op subscription instead of throwing when the runtime is
 * unavailable.
 */
export interface AnimeRuntimeSource {
  readonly subscribeAnimeChanges: (listener: (notice: AnimeChangedNotice) => void) => () => void;
}
