import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../shared/contracts/anime.types';
import { ANIME_EDITOR_COVER_LOADING, ANIME_EDITOR_COVER_PLACEHOLDER } from './anime-editor-workspace.constants';
import { planAnimeEditorCoverRequests, toAnimeEditorCoverEntry, toAnimeEditorCoverTargets } from './anime-editor-workspace.helpers';
import type { AnimeEditorCoverCache, AnimeEditorCoverSource, AnimeEditorListItemViewModel } from './anime-editor-workspace.types';

/**
 * Resolves one thumbnail per anime the rail actually shows, and hands back the
 * cache both the rows and the detail header render from.
 *
 * Mirrors `useEpisodeCovers`/`useNotificationDetailCovers`' fetch, degrade and
 * placeholder shape, with the two gates this rail needs and they do not: the
 * ids come from `toAnimeEditorCoverTargets`, so an 800-anime library resolves
 * the progressive window's rows (plus the selected saved record) instead of the
 * whole catalog, and a row the DTO reports as coverless is never asked for at
 * all.
 *
 * What each anime is remembered BY is `planAnimeEditorCoverRequests`' call, not
 * the cache's: an id alone is not enough, because the same anime can be saved
 * with a different cover. A target carrying a different saved source than the
 * one already resolved is re-resolved (so a saved A -> B updates both the row
 * and the header), a target whose source merely becomes known or unknown is not,
 * and a target with no cover invalidates its entry back to the placeholder (so a
 * removed cover cannot linger in a row the list reloaded as coverless). A
 * superseded lookup is dropped rather than applied, which is why an older A
 * response landing after the B request cannot overwrite the newer thumbnail --
 * while a lookup whose answer is still the only one arriving is kept, so an
 * in-flight row lookup is not thrown away when the record then names it.
 *
 * @param items The projected rail rows, before the window is applied.
 * @param visibleCount How many rows the progressive window currently renders.
 * @param record The selected authoritative editor record, when one is loaded.
 * @param source The runtime port `getAnimeCover` is called through. The binding
 * is optional on `AnimeEditorCoverSource`, so a non-Wails context degrades every
 * target to the placeholder instead of throwing.
 * @returns The per-anime cover cache and the decoder-failure handler the rows
 * and the header report a broken image through.
 */
export function useAnimeEditorCovers(
  items: readonly AnimeEditorListItemViewModel[],
  visibleCount: number,
  record: AnimeEditorRecord | undefined,
  source: AnimeEditorCoverSource,
): AnimeEditorCoverCache {
  // 1. Refs
  // The stored source each anime was last resolved FROM. A present key with an
  // `undefined` value is a row that was resolved on presence alone.
  const requestedVersionsRef = useRef<Map<string, string | undefined>>(new Map());
  // The newest lookup token per anime. A response is applied only while its own
  // token is still the newest for that anime, which is what keeps a superseded
  // or invalidated lookup from overwriting whatever replaced it. A fresh Symbol
  // per request cannot collide with any other, present or past.
  const requestTicketsRef = useRef<Map<string, symbol>>(new Map());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, AnimeCoverEntry>>(new Map());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const targets = useMemo(() => toAnimeEditorCoverTargets(items, visibleCount, record), [items, record, visibleCount]);

  // 6. Callbacks (useCallback calling pure helpers)
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays
  // element-by-element with `Object.is`, and the callback closes over nothing, so its identity
  // stays stable across rerenders under either one and no test can observe the difference.
  const onCoverImageError = useCallback((animeId: string) => {
    setCovers((previous) => withAnimeEditorCoverEntry(previous, animeId, ANIME_EDITOR_COVER_PLACEHOLDER));
  }, []);
  // Stryker restore ArrayDeclaration

  // 7. Effects
  useEffect(() => {
    const plan = planAnimeEditorCoverRequests(targets, requestedVersionsRef.current);
    requestedVersionsRef.current = new Map(plan.requestedVersions);

    // No guard on this block: `withAnimeEditorCoverPlaceholders` returns the cache
    // it was given when nothing is invalidated, so React bails out of the same
    // state and an empty invalidation list costs nothing.
    for (const animeId of plan.invalidatedIds) {
      requestTicketsRef.current.delete(animeId);
    }
    setCovers((previous) => withAnimeEditorCoverPlaceholders(previous, plan.invalidatedIds));

    const { requests } = plan;

    if (requests.length === 0) {
      return;
    }

    const getAnimeCover = source.getAnimeCover;

    if (getAnimeCover === undefined) {
      for (const animeId of requests) {
        requestTicketsRef.current.delete(animeId);
      }
      setCovers((previous) => withAnimeEditorCoverPlaceholders(previous, requests));
      return;
    }

    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Cover entries are async fetch state keyed by freshly loaded rows, so the loading map must update when those rows change.
    setCovers((previous) => withAnimeEditorCoverEntries(previous, requests, ANIME_EDITOR_COVER_LOADING));

    for (const animeId of requests) {
      const ticket = Symbol();
      requestTicketsRef.current.set(animeId, ticket);
      // Read the token back at settle time: a later plan may have superseded
      // this lookup, or dropped the anime's cover entirely.
      const stillOwesTheAnswer = () => requestTicketsRef.current.get(animeId) === ticket;

      void getAnimeCover(animeId)
        .then((result) => {
          if (stillOwesTheAnswer()) {
            setCovers((previous) => withAnimeEditorCoverEntry(previous, animeId, toAnimeEditorCoverEntry(result)));
          }
        })
        .catch(() => {
          if (stillOwesTheAnswer()) {
            setCovers((previous) => withAnimeEditorCoverEntry(previous, animeId, ANIME_EDITOR_COVER_PLACEHOLDER));
          }
        });
    }
  }, [source, targets]);

  return { covers, onCoverImageError };
}

/**
 * Returns a copy of the cover cache with one anime's entry replaced.
 *
 * A new Map every time because the cache is state: mutating the existing one
 * would leave React comparing an object with itself and skipping the render.
 *
 * @param previous The cache being replaced.
 * @param animeId The anime whose entry changes.
 * @param entry The entry to store for it.
 * @returns The updated cache.
 */
function withAnimeEditorCoverEntry(
  previous: ReadonlyMap<string, AnimeCoverEntry>,
  animeId: string,
  entry: AnimeCoverEntry,
): ReadonlyMap<string, AnimeCoverEntry> {
  return withAnimeEditorCoverEntries(previous, [animeId], entry);
}

/**
 * Returns a copy of the cover cache with the same entry stored for several ids.
 *
 * @param previous The cache being replaced.
 * @param animeIds The ids whose entries change.
 * @param entry The entry to store for each of them.
 * @returns The updated cache.
 */
function withAnimeEditorCoverEntries(
  previous: ReadonlyMap<string, AnimeCoverEntry>,
  animeIds: readonly string[],
  entry: AnimeCoverEntry,
): ReadonlyMap<string, AnimeCoverEntry> {
  const next = new Map(previous);
  for (const animeId of animeIds) {
    next.set(animeId, entry);
  }
  return next;
}

/**
 * Returns a copy of the cover cache with the given ids dropped back to the
 * shared placeholder.
 *
 * Returns the cache it was given, unchanged, when every id is already on the
 * placeholder, so re-planning an unchanged coverless rail does not churn state.
 *
 * @param previous The cache being replaced.
 * @param animeIds The ids that no longer have a cover.
 * @returns The updated cache, or the same one when nothing changed.
 */
function withAnimeEditorCoverPlaceholders(
  previous: ReadonlyMap<string, AnimeCoverEntry>,
  animeIds: readonly string[],
): ReadonlyMap<string, AnimeCoverEntry> {
  const staleIds = animeIds.filter((animeId) => previous.get(animeId) !== ANIME_EDITOR_COVER_PLACEHOLDER);

  return staleIds.length === 0 ? previous : withAnimeEditorCoverEntries(previous, staleIds, ANIME_EDITOR_COVER_PLACEHOLDER);
}
