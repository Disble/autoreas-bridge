import { useMemo } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { useAnimeCoverCache } from '../../../../shared/anime-cover/use-anime-cover-cache';
import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import type { RunHistoryPanelPorts } from './run-history-panel.types';
import { collectDetailAnimeIds, toSelectedRunDetail } from './run-history-story.helpers';
import { useRunHistoryStory } from './use-run-history-story';

/**
 * useRunHistoryDetail builds the selected run's detail from its stored run
 * story and resolves the covers of the anime it names through the shared
 * cover cache.
 *
 * @param selectedRun The selected run, if any.
 * @param ports The run-story and cover ports; covers default to the bridge source.
 * @returns The detail view model and the cover per anime id.
 */
export function useRunHistoryDetail(selectedRun: DownloadRunView | undefined, ports: RunHistoryPanelPorts) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const storyState = useRunHistoryStory(selectedRun, ports.storySource);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const detail = useMemo(() => toSelectedRunDetail(selectedRun, storyState), [selectedRun, storyState]);
  const coverIds = useMemo(() => collectDetailAnimeIds(detail), [detail]);
  const covers = useAnimeCoverCache(coverIds, ports.coverSource ?? bridgeRuntimeSource);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { detail, covers };
}
