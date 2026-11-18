import type {
  Anime,
  AnimeDetail,
  AnimeWatchHistoryPageRequest,
  WatchHistoryPage,
  WatchHistoryPageRequest,
} from './anime.types';

/** One cover-binding answer: a base64 data URL, or the explicit placeholder signal. */
export interface AnimeCoverResult {
  /** 'cover' when the binding found one; anything else means the placeholder. */
  readonly source: string;
  /** The cover as a data URL, when the binding returned one. */
  readonly dataUrl?: string;
}

/**
 * Port of the anime module's reads (ADR-032 §4): the catalog, one anime's
 * detail, the global and per-anime watch history pages and a saved cover. The
 * Wails adapter is `createAnimeSource`
 * (`infrastructure/bridge-runtime-source/anime-source.helpers.ts`), built once
 * in `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every read
 * rejects with a `BridgeError` and never answers `[]`, `null` or an error-status
 * page in place of a failure: `unavailable` while the module starts,
 * `failed_precondition` once it failed, `not_found` for an unknown anime.
 */
export interface AnimeSource {
  /** The flat catalog list. */
  readonly getAnimes: () => Promise<readonly Anime[]>;
  /** One anime's rich detail; an unknown id rejects with `not_found`. */
  readonly getAnimeDetail: (animeId: string) => Promise<AnimeDetail>;
  /** One keyset page of the global watch history. */
  readonly getWatchHistoryPage: (request: WatchHistoryPageRequest) => Promise<WatchHistoryPage>;
  /** One keyset page of one anime's watch history. */
  readonly getAnimeWatchHistoryPage: (request: AnimeWatchHistoryPageRequest) => Promise<WatchHistoryPage>;
  /** One saved cover as a data URL, or the placeholder signal for an anime without one. */
  readonly getAnimeCover: (animeId: string) => Promise<AnimeCoverResult>;
}

/**
 * The anime module's cover preview, served by the same adapter as
 * `AnimeSource` (`BRIDGE_ANIME_SOURCE`): a cover value typed in the Editor or
 * the create form (a URL or an on-disk path) as a data URL, or the placeholder
 * signal for an empty value. A failure rejects with a `BridgeError` like the
 * reads of `AnimeSource`, never with a placeholder.
 */
export interface AnimeCoverPreviewSource {
  /** One cover value as a data URL, or the placeholder signal for an empty one. */
  readonly previewAnimeCover: (value: string) => Promise<AnimeCoverResult>;
}
