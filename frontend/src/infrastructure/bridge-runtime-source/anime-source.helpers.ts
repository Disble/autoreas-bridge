import { GetAnimeCover, GetAnimeDetail, GetAnimes, GetAnimeWatchHistoryPage, GetWatchHistoryPage } from '../../../wailsjs/go/desktop/App';
import type { AnimeCoverResult, AnimeSource } from '../../shared/contracts/anime-source.types';
import type { Anime, AnimeDetail, WatchHistoryPage } from '../../shared/contracts/anime.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one anime binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callAnimeBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `AnimeSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every read rejects
 * with the module's `unavailable` / `failed_precondition` failure rather than
 * answer `[]`, `null` or an error-status page, so the catalog, the detail page
 * and History never mistake a starting backend for an empty one.
 * @returns The source.
 */
export function createAnimeSource(): AnimeSource {
  return {
    getAnimes: () => callAnimeBinding<readonly Anime[]>('GetAnimes', () => GetAnimes()),
    getAnimeDetail: (animeId) => callAnimeBinding<AnimeDetail>('GetAnimeDetail', () => GetAnimeDetail(animeId)),
    getWatchHistoryPage: (request) =>
      callAnimeBinding<WatchHistoryPage>('GetWatchHistoryPage', () => GetWatchHistoryPage({ ...request, animeIds: [...request.animeIds] })),
    getAnimeWatchHistoryPage: (request) =>
      callAnimeBinding<WatchHistoryPage>('GetAnimeWatchHistoryPage', () => GetAnimeWatchHistoryPage({ ...request })),
    getAnimeCover: (animeId) => callAnimeBinding<AnimeCoverResult>('GetAnimeCover', () => GetAnimeCover(animeId)),
  };
}
