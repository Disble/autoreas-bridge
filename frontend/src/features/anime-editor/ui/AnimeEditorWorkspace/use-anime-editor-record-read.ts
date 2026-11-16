import { useCallback, useEffect, useRef } from 'react';
import type { AnimeEditorSource } from '../../../../shared/contracts/anime-editor-source.types';
import { animeEditorKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toAnimeEditorSettledRecordRead } from './anime-editor-record.helpers';
import type { AnimeEditorSettledRecordRead } from './anime-editor-workspace.types';

/**
 * Reads the selected anime's record through the anime module, split out of
 * `useAnimeEditorRecord` (fallow complexity guard). The record reads while
 * its query fetches, including while the anime module starts, and each
 * settled read reaches `onSettled` exactly once.
 * @param editorSource The anime module's record read.
 * @param selectedAnimeId The selected anime; no read runs without one.
 * @param onSettled Replaces the draft from one settled read.
 * @returns Whether the record is reading, and the call that reads it again.
 */
export function useAnimeEditorRecordRead(
  editorSource: Pick<AnimeEditorSource, 'getAnimeEditorRecord'>,
  selectedAnimeId: string | undefined,
  onSettled: (read: AnimeEditorSettledRecordRead) => void,
) {
  // 1. Refs
  // The settled read last handed over; the same read never replaces the draft twice.
  const appliedRead = useRef<string | undefined>(undefined);

  // 4. Queries/Mutations
  const recordQuery = useBridgeQuery({
    queryKey: animeEditorKeys.key('record', selectedAnimeId),
    queryFn: () => editorSource.getAnimeEditorRecord(selectedAnimeId ?? ''),
    module: 'anime',
    enabled: selectedAnimeId !== undefined,
    gcTime: 0,
  });

  // 5. Derived State
  const settledRead = toAnimeEditorSettledRecordRead(recordQuery);
  const refetchRecord = recordQuery.refetch;

  // 6. Callbacks
  /** Reads the selected record again; its answer replaces the draft once it settles. */
  const loadRecord = useCallback(async () => {
    await refetchRecord();
  }, [refetchRecord]);

  // 7. Effects
  useEffect(() => {
    if (settledRead === undefined || appliedRead.current === settledRead.stamp) return;
    appliedRead.current = settledRead.stamp;
    onSettled(settledRead);
  }, [settledRead, onSettled]);

  return { isLoadingRecord: recordQuery.isFetching, loadRecord };
}
