import { useEffect, useMemo, useState } from 'react';
import type { EpisodeDurationRuntimeSource } from '../../../../shared/contracts/episode-durations.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { EPISODE_DURATIONS_RELOAD_DELAY_MS, EPISODE_DURATIONS_UNSETTLED } from './episode-durations-section.constants';
import {
  isEpisodeDurationsTargetPending,
  readEpisodeDurationSection,
  toEpisodeDurationRequest,
  toEpisodeDurationRowViews,
  toEpisodeDurationsLoad,
  toEpisodeDurationsQueryKey,
} from './episode-durations-section.helpers';
import type { EpisodeDurationsTarget, UseEpisodeDurationsLoadOptions } from './episode-durations-section.types';

/**
 * Reads the Episodes card for the SAVED anime through the episodes module and
 * serves its rows with the card's unsaved edits applied. While the module
 * starts the card stays loading without a read; once it failed it shows the
 * reason. A saved change of the folder, total or type (after an anime save),
 * and an episodes save that bumps `revision`, read again under a new key once
 * they settle for `EPISODE_DURATIONS_RELOAD_DELAY_MS`, so a burst of record
 * reloads reads the disk once; the card shows loading while one is settling.
 */
export function useEpisodeDurationsLoad(options: Readonly<UseEpisodeDurationsLoadOptions>, source: EpisodeDurationRuntimeSource) {
  // 1. Refs

  // 2. State
  const [settled, setSettled] = useState<EpisodeDurationsTarget>(EPISODE_DURATIONS_UNSETTLED);

  // 3. Context/3rd Party Hooks
  const request = useMemo(
    () => toEpisodeDurationRequest(options.animeId, options.folder, options.totalEpisodes, options.kind),
    [options.animeId, options.folder, options.kind, options.totalEpisodes],
  );

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: toEpisodeDurationsQueryKey(settled.request, settled.revision),
    queryFn: () => readEpisodeDurationSection(source, settled.request),
    module: 'episodes',
    enabled: settled.request !== undefined,
  });

  // 5. Derived State (useMemo)
  const { data, error, isPlaceholderData, status } = query;
  const isPending = isEpisodeDurationsTargetPending(settled, request, options.revision);
  // Keyed on the query fields toAsyncView reads, so `load` keeps its identity between renders.
  // Stryker disable BooleanLiteral: `isFetching` only sets the ready view's `isRefreshing`, which
  // toEpisodeDurationsLoad never reads, so `true` and `false` give the same load.
  const load = useMemo(
    () => toEpisodeDurationsLoad(request, toAsyncView({ status, data, error, isFetching: false }), isPlaceholderData || isPending),
    [data, error, isPending, isPlaceholderData, request, status],
  );
  // Stryker restore BooleanLiteral
  const rows = useMemo(() => (load.status === 'ready' ? toEpisodeDurationRowViews(load.section, options.edits) : []), [load, options.edits]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled({ request, revision: options.revision }), EPISODE_DURATIONS_RELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [options.revision, request]);

  return { load, request, rows };
}
