import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';

/**
 * Loads the two things the create form needs before it can be used: the shared
 * schedule board and the configured downloads root. Split out of
 * `useAnimeCreate` on 2026-08-14 so its mount-time I/O does not share a hook
 * budget with the row editing and the submit.
 * @param setBoard Receives the fetched schedule board.
 * @param setDownloadsRoot Receives the configured downloads root.
 */
export function useAnimeCreateBootstrap(
  setBoard: Dispatch<SetStateAction<AnimeEditorScheduleBoard | undefined>>,
  setDownloadsRoot: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    let cancelled = false;
    void bridgeRuntimeSource.getAnimeEditorScheduleBoard?.('').then((result) => {
      if (!cancelled) {
        setBoard(result.board);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setBoard]);
  useEffect(() => {
    void preferencesSource.getDownloadsRoot().then(setDownloadsRoot);
  }, [setDownloadsRoot]);
}
