import { useMemo } from 'react';
import { useAnimeCoverCache } from '../../../../shared/anime-cover/use-anime-cover-cache';
import type { DownloadRunView } from '../../../../shared/contracts/download.types';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { RunHistoryPanelPorts } from './run-history-panel.types';
import { collectDetailAnimeIds, collectNameLookupIds, toRunHistoryDetailViewModel, withCatalogNames } from './run-history-story.helpers';
import { useAnimeNameCache } from './use-anime-name-cache';
import { useRunHistoryStory } from './use-run-history-story';

/**
 * useRunHistoryDetail builds the selected run's detail from its stored run
 * story and resolves the covers of the anime it names through the shared
 * cover cache. Covers and catalog names default to the anime module's port
 * (`BRIDGE_ANIME_SOURCE`); a name read that rejects, `not_found` included,
 * leaves the step's stored name, since a run row has no failure state for it.
 *
 * @param selectedRun The selected run, if any.
 * @param ports The run-story, cover and name ports; covers and names default to the anime module's port.
 * @returns The detail view model and the cover per anime id.
 */
export function useRunHistoryDetail(selectedRun: DownloadRunView | undefined, ports: RunHistoryPanelPorts) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const storyState = useRunHistoryStory(selectedRun, ports.storySource);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const storyDetail = useMemo(
    () => (selectedRun === undefined ? undefined : toRunHistoryDetailViewModel(selectedRun, storyState)),
    [selectedRun, storyState],
  );
  const coverIds = useMemo(() => collectDetailAnimeIds(storyDetail), [storyDetail]);
  const covers = useAnimeCoverCache(coverIds, ports.coverSource ?? BRIDGE_ANIME_SOURCE);
  const nameIds = useMemo(() => collectNameLookupIds(storyDetail), [storyDetail]);
  const names = useAnimeNameCache(nameIds, ports.nameSource ?? BRIDGE_ANIME_SOURCE);
  const detail = useMemo(() => (storyDetail === undefined ? undefined : withCatalogNames(storyDetail, names)), [storyDetail, names]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { detail, covers };
}
