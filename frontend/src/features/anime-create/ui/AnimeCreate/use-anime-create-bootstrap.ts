import { useCallback, useMemo } from 'react';
import type { AnimeEditorSource } from '../../../../shared/contracts/anime-editor-source.types';
import type { SettingsSource } from '../../../../shared/contracts/settings.types';
import { BRIDGE_ANIME_EDITOR_SOURCE, BRIDGE_SETTINGS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { animeEditorKeys, settingsKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';

/**
 * Reads the two things the create form needs before it can be used: the shared
 * schedule board, through the anime module, and the configured library root,
 * through the settings module. Split out of `useAnimeCreate` on 2026-08-14 so
 * its mount-time reads do not share a hook budget with the row editing and the
 * submit. While a module starts its value stays absent, so the board cannot be
 * opened yet; a failed library-root read leaves the root unset.
 * @param source The anime module's board read.
 * @param settingsSource The settings module's library-root read.
 * @returns The board, the library root, and a reload of the board after a create.
 */
export function useAnimeCreateBootstrap(
  source: Pick<AnimeEditorSource, 'getAnimeEditorScheduleBoard'> = BRIDGE_ANIME_EDITOR_SOURCE,
  settingsSource: Pick<SettingsSource, 'getLibraryRoot'> = BRIDGE_SETTINGS_SOURCE,
) {
  // 4. Queries/Mutations
  const boardQuery = useBridgeQuery({
    queryKey: animeEditorKeys.key('schedule-board', ''),
    queryFn: () => source.getAnimeEditorScheduleBoard(''),
    module: 'anime',
    gcTime: 0,
  });
  const libraryRootQuery = useBridgeQuery({ queryKey: settingsKeys.key('library-root'), queryFn: () => settingsSource.getLibraryRoot(), module: 'settings' });

  // 5. Derived State (useMemo)
  const board = boardQuery.data?.board;
  const libraryRoot = libraryRootQuery.data ?? '';

  // 6. Callbacks (useCallback calling pure helpers)
  const refetchBoard = boardQuery.refetch;
  /** Reads the board again, after a create placed new animes on it. */
  const reloadBoard = useCallback(async () => {
    await refetchBoard();
  }, [refetchBoard]);

  return useMemo(() => ({ board, libraryRoot, reloadBoard }), [board, libraryRoot, reloadBoard]);
}
