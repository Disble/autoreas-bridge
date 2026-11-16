import { useMemo } from 'react';
import type { AnimeEditorSource } from '../../../../shared/contracts/anime-editor-source.types';
import { BRIDGE_ANIME_EDITOR_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { ANIME_LIST_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
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
 *
 * The catalogue reads through the anime module; until it answers, no name conflicts.
 * @param rows The current batch-create rows.
 * @param source The anime module's catalogue read.
 * @returns The per-row conflict messages and whether any row currently has one.
 */
export function useAnimeCreateNameConflicts(rows: readonly AnimeCreateRowDraft[], source: Pick<AnimeEditorSource, 'getAnimes'> = BRIDGE_ANIME_EDITOR_SOURCE) {
  // The whole catalogue, deleted records included, is what the backend guard
  // compares against, so this early check has to see the same set.
  const catalogQuery = useBridgeQuery({ queryKey: ANIME_LIST_KEY, queryFn: () => source.getAnimes(), module: 'anime' });
  const catalog = catalogQuery.data;
  const storedNames = useMemo(() => (catalog ?? []).map((anime) => anime.name), [catalog]);
  const settledRows = useDebounce(rows, ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS);

  const nameConflicts = useMemo(
    () => findAnimeCreateNameConflicts(settledRows, storedNames),
    [settledRows, storedNames],
  );
  const hasNameConflict = useMemo(
    () => rows.some((row) => nameConflicts[row.draftId] !== undefined),
    [nameConflicts, rows],
  );

  return { nameConflicts, hasNameConflict };
}
