import { useEffect, useMemo, useRef, useState } from 'react';
import type { EpisodeDurationRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { EPISODE_DURATIONS_IDLE_LOAD, EPISODE_DURATIONS_RELOAD_DELAY_MS } from './episode-durations-section.constants';
import { toEpisodeDurationRequest, toEpisodeDurationRowViews, toEpisodeDurationsLoad, toEpisodeErrorMessage } from './episode-durations-section.helpers';
import type { EpisodeDurationsLoad, UseEpisodeDurationsSectionOptions } from './episode-durations-section.types';

/**
 * Reads the Episodes section for what the Editor draft shows now, saved or not,
 * and serves its rows with the draft's unsaved edits applied. A change of the
 * draft's folder, total or type reads again once typing settles; a save that
 * bumps `revision` reads again too. Only the latest request may settle the state.
 */
export function useEpisodeDurationsLoad(options: Readonly<UseEpisodeDurationsSectionOptions>, source: EpisodeDurationRuntimeSource) {
  // 1. Refs
  const latestRead = useRef<object | undefined>(undefined);

  // 2. State
  const [load, setLoad] = useState<EpisodeDurationsLoad>(EPISODE_DURATIONS_IDLE_LOAD);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const request = useMemo(
    () => toEpisodeDurationRequest(options.animeId, options.folder, options.totalEpisodes, options.kind),
    [options.animeId, options.folder, options.kind, options.totalEpisodes],
  );
  const rows = useMemo(() => (load.status === 'ready' ? toEpisodeDurationRowViews(load.section, options.edits) : []), [load, options.edits]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const read = {};
    latestRead.current = read;
    if (request === undefined) {
      setLoad(EPISODE_DURATIONS_IDLE_LOAD);
      return undefined;
    }
    setLoad({ status: 'loading' });
    const timer = window.setTimeout(() => {
      source.getEpisodeDurationSection(request)
        .then((section) => { if (latestRead.current === read) setLoad(toEpisodeDurationsLoad(section)); })
        .catch((error: unknown) => { if (latestRead.current === read) setLoad({ status: 'failed', message: toEpisodeErrorMessage(error) }); });
    }, EPISODE_DURATIONS_RELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [options.revision, request, source]);

  return { load, request, rows };
}
