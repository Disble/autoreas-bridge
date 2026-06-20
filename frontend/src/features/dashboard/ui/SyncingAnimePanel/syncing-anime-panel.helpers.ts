import type { SyncingAnime } from '../../../../shared/contracts/syncing-anime.types';
import { formatLocalDateTime } from '../../../../shared/datetime/datetime.helpers';
import type { SyncingAnimePanelTone, SyncingAnimePanelViewModel } from './syncing-anime-panel.types';

/**
 * Formats the queue count with singular/plural wording for pending anime items.
 */
export function formatSyncingAnimeQueueLabel(pendingChanges: number) {
  return `${pendingChanges} pending ${pendingChanges === 1 ? 'change' : 'changes'}`;
}

/**
 * Formats truthful progress text from the pending anime snapshot.
 */
export function formatSyncingAnimeProgress(progressCurrent?: number, progressTotal?: number) {
  if (progressCurrent === undefined) {
    return null;
  }

  if (progressTotal === undefined) {
    return `Episode ${progressCurrent}`;
  }

  return `Episode ${progressCurrent} / ${progressTotal}`;
}

function getSyncingAnimeChangePresentation(changeType: string): { label: string; tone: SyncingAnimePanelTone } {
  if (changeType === 'create') {
    return { label: 'Created', tone: 'success' };
  }

  if (changeType === 'delete') {
    return { label: 'Removed', tone: 'danger' };
  }

  return { label: 'Updated', tone: 'warning' };
}

/**
 * Maps a runtime syncing-anime DTO into the presentation model rendered by the dashboard panel.
 */
export function toSyncingAnimePanelViewModel(item: SyncingAnime): SyncingAnimePanelViewModel {
  const changePresentation = getSyncingAnimeChangePresentation(item.changeType);

  return {
    animeId: item.animeId,
    title: item.title || item.animeId,
    changeLabel: changePresentation.label,
    changeTone: changePresentation.tone,
    queueLabel: formatSyncingAnimeQueueLabel(item.pendingChanges),
    progressLabel: formatSyncingAnimeProgress(item.progressCurrent, item.progressTotal),
    changedFields: item.changedFields ?? [],
    lastUpdatedLabel: formatLocalDateTime(new Date(item.lastChangedAtMs).toISOString()),
  };
}
