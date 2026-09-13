import { useEffect, useState } from 'react';
import type { BridgeRuntimeSource } from '../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

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
 * Resolves the cover for exactly one anime through the existing
 * `getAnimeCover` binding, the surface Episodes/Today already renders
 * correctly through (anime-cover-rendering spec, "Covers resolve through
 * the binding, never a raw stored path"). Mirrors `useEpisodeCovers` and
 * `useNotificationDetailCovers`'s fetch/degrade/placeholder shape, but far
 * simpler: one cover for one anime, no fan-out and no per-row cache.
 *
 * `hasStoredCover` is the client-side gate (design D1): when the detail's
 * stored path already normalized to "no cover" (`toAnimeDetailViewModel`'s
 * `hasStoredCover`), this hook never calls the binding at all and resolves
 * straight to the placeholder.
 *
 * @param animeId The anime whose cover is resolved, request-sequenced so a
 * response for a superseded id never overwrites a newer one in flight.
 * @param hasStoredCover Whether the loaded detail has a non-empty,
 * non-`"null"` stored cover path (anime-cover-rendering spec, "An empty or
 * sentinel stored path skips the binding").
 * @param source The runtime port `getAnimeCover` is called through.
 * `getAnimeCover` is optional on `BridgeRuntimeSource`, so its absence
 * degrades to the placeholder rather than throwing.
 * @returns The cover's current resolution state.
 */
export function useAnimeCover(
  animeId: string,
  hasStoredCover: boolean,
  source: BridgeRuntimeSource,
): AnimeCoverEntry {
  // 1. Refs

  // 2. State
  // Starts as `placeholder` unconditionally, mirroring `useEpisodeCovers`
  // and `useNotificationDetailCovers` (neither pre-seeds a `loading` entry):
  // the effect below always runs on mount and immediately corrects this to
  // `loading` before the binding call when `hasStoredCover` is true.
  const [cover, setCover] = useState<AnimeCoverEntry>({ status: 'placeholder' });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    if (!hasStoredCover || source.getAnimeCover === undefined) {
      setCover({ status: 'placeholder' });
      return;
    }

    let active = true;
    setCover({ status: 'loading' });

    try {
      void source
        .getAnimeCover(animeId)
        .then((result) => {
          if (!active) {
            return;
          }

          setCover(
            result.source === 'cover' && result.dataUrl !== undefined
              ? { status: 'cover', dataUrl: result.dataUrl }
              : { status: 'placeholder' },
          );
        })
        .catch(() => {
          if (active) {
            setCover({ status: 'placeholder' });
          }
        });
    } catch {
      // Reached only synchronously, in the same tick `active` was just set
      // to `true` in -- no render can flip it before a synchronous throw,
      // so this path is never stale.
      setCover({ status: 'placeholder' });
    }

    return () => {
      active = false;
    };
  }, [animeId, hasStoredCover, source]);

  return cover;
}
