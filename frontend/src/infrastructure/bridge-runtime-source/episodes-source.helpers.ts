import { AdjustWatchedEpisodes, GetEpisodeDayCounts, GetEpisodeSchedule, RepeatAnime, RestoreAnime, SetAnimeState } from '../../../wailsjs/go/desktop/App';
import type { EpisodeCommandsSource, EpisodeDayCount, EpisodeScheduleItem, EpisodesSource } from '../../shared/contracts/episodes.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one episodes binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callEpisodesBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `EpisodesSource` and `EpisodeCommandsSource` ports
 * (ADR-032 §4), built once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
 * Both reads reject with the module's `unavailable` / `failed_precondition`
 * failure rather than answer `[]`, so Today never mistakes a starting backend
 * for an empty day; the commands resolve with the write's outcome and reject
 * with its failure.
 * @returns The source.
 */
export function createEpisodesSource(): EpisodesSource & EpisodeCommandsSource {
  return {
    getEpisodeSchedule: (day) =>
      callEpisodesBinding<readonly EpisodeScheduleItem[]>('GetEpisodeSchedule', () => GetEpisodeSchedule(day)),
    getEpisodeDayCounts: () => callEpisodesBinding<readonly EpisodeDayCount[]>('GetEpisodeDayCounts', () => GetEpisodeDayCounts()),
    adjustWatchedEpisodes: (animeID, delta, base) =>
      callEpisodesBinding('AdjustWatchedEpisodes', () => AdjustWatchedEpisodes(animeID, delta, base)),
    setAnimeState: (animeID, estado, base) => callEpisodesBinding('SetAnimeState', () => SetAnimeState(animeID, estado, base)),
    restoreAnime: (animeID, base) => callEpisodesBinding('RestoreAnime', () => RestoreAnime(animeID, base)),
    repeatAnime: (animeID, base) => callEpisodesBinding('RepeatAnime', () => RepeatAnime(animeID, base)),
  };
}
