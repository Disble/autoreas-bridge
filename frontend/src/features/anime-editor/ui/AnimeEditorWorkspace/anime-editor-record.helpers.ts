import { toEditorErrorMessage } from './anime-editor-workspace.helpers';
import type { AnimeEditorRecordQueryRead, AnimeEditorSettledRecordRead } from './anime-editor-workspace.types';

/**
 * Returns the record read that replaces the draft once it settles: undefined
 * while the read fetches, shows the previous anime's data, or has not answered
 * yet. A failed read carries its message and no record.
 */
export function toAnimeEditorSettledRecordRead(read: AnimeEditorRecordQueryRead): AnimeEditorSettledRecordRead | undefined {
  if (read.isFetching || read.isPlaceholderData || read.status === 'pending') return undefined;
  return {
    stamp: `${read.status}:${read.dataUpdatedAt}:${read.errorUpdatedAt}`,
    selectedRecord: read.status === 'success' ? read.data?.record : undefined,
    recordLoadError: read.status === 'error' ? toEditorErrorMessage(read.error) : undefined,
  };
}

/** Returns the record read failure to show: none while the record reads again. */
export function toShownRecordLoadError(isLoadingRecord: boolean, recordLoadError: string | undefined): string | undefined {
  return isLoadingRecord ? undefined : recordLoadError;
}
