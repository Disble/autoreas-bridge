import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import { ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS } from './anime-create.constants';
import { findAnimeCreateNameConflicts } from './anime-create.helpers';
import type { AnimeCreateRowDraft } from './anime-create.types';

/**
 * Owns the whole "is this name still free?" question: the catalogue it compares
 * against, the settle before a half-typed name is judged, and the per-row
 * verdict.
 *
 * It lives beside `useAnimeCreateRows` and `useAnimeCreateBootstrap` rather than
 * inside `useAnimeCreate` for the reason that split those out on 2026-08-14 —
 * the parent hook is already at its hook budget, and none of this knows about
 * the schedule board or the submit.
 * @param rows The current batch-create rows.
 * @returns The per-row conflict messages and whether any row currently has one.
 */
export function useAnimeCreateNameConflicts(rows: readonly AnimeCreateRowDraft[]) {
  const [storedNames, setStoredNames] = useState<readonly string[]>([]);
  const settledRows = useDebounce(rows, ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS);

  const nameConflicts = useMemo(
    () => findAnimeCreateNameConflicts(settledRows, storedNames),
    [settledRows, storedNames],
  );
  const hasNameConflict = useMemo(
    () => rows.some((row) => nameConflicts[row.draftId] !== undefined),
    [nameConflicts, rows],
  );

  // The whole catalogue, deleted records included, is what the backend guard
  // compares against, so this early check has to see the same set.
  useEffect(() => {
    let cancelled = false;
    void bridgeRuntimeSource.getAnimes?.().then((animes) => {
      if (!cancelled) {
        setStoredNames(animes.map((anime) => anime.name));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { nameConflicts, hasNameConflict };
}
