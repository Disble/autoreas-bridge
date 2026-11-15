import { BRIDGE_ANIME_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { animeKeys } from '../query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';
import { toAnimeCoverQueryEntry } from './anime-cover.helpers';
import type { AnimeCoverSource } from './anime-cover.types';

/**
 * The three states a single anime's cover can be in while a consumer (e.g.
 * `AnimeDetail`) renders its hero avatar (design D2). No stored path is ever
 * carried inside this type, so a raw stored path structurally cannot reach
 * an `<img src>` from here.
 */
export type AnimeCoverEntry =
  | { readonly status: 'loading' }
  | { readonly status: 'cover'; readonly dataUrl: string }
  | { readonly status: 'placeholder' };

/**
 * Resolves the cover for exactly one anime through the `getAnimeCover`
 * binding (anime-cover-rendering spec, "Covers resolve through the binding,
 * never a raw stored path"), read through `useBridgeQuery` on the `anime`
 * module: while the module starts the cover stays `loading`, and a failed read
 * degrades to the placeholder, because a missing cover is never a page failure.
 *
 * `hasStoredCover` is the client-side gate (design D1): when the detail's
 * stored path already normalized to "no cover" (`toAnimeDetailViewModel`'s
 * `hasStoredCover`), this hook never calls the binding at all and resolves
 * straight to the placeholder.
 *
 * @param animeId The anime whose cover is resolved; the previous anime's cover
 * is never shown for a new id (it reads as `loading` until the new one lands).
 * @param hasStoredCover Whether the loaded detail has a non-empty,
 * non-`"null"` stored cover path (anime-cover-rendering spec, "An empty or
 * sentinel stored path skips the binding").
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) degrades to the placeholder rather than throwing.
 * @returns The cover's current resolution state.
 */
export function useAnimeCover(
  animeId: string,
  hasStoredCover: boolean,
  source: AnimeCoverSource = BRIDGE_ANIME_SOURCE,
): AnimeCoverEntry {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const getAnimeCover = source.getAnimeCover;
  const isEnabled = hasStoredCover && getAnimeCover !== undefined;
  const query = useBridgeQuery({
    queryKey: animeKeys.key('cover', animeId),
    queryFn: () => (getAnimeCover === undefined ? Promise.reject(new Error('no cover binding')) : getAnimeCover(animeId)),
    module: 'anime',
    enabled: isEnabled,
  });

  // 5. Derived State (useMemo)
  const cover = toAnimeCoverQueryEntry(isEnabled, query);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return cover;
}
