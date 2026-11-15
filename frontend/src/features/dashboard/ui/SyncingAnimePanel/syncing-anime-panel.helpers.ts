import type { SyncingAnime } from '../../../../shared/contracts/syncing-anime.types';
import { formatLocalDateTime } from '../../../../shared/datetime/datetime.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import type { SyncingAnimePanelTone, SyncingAnimePanelView, SyncingAnimePanelViewModel, SyncingAnimeQueryState } from './syncing-anime-panel.types';

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

/**
 * The label and tone of a pending change's type: created, deleted, otherwise updated.
 * @param changeType The changelog change type.
 * @returns The chip label and tone.
 */
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

/**
 * The one state the panel renders (ADR-032 §4), from the pending-sync query.
 * A refresh after a reconcile (a new refresh token) that still shows the previous
 * read's items is `loading`, so the queue never shows a superseded snapshot.
 * @param query The pending-sync query.
 * @returns The panel view, with render-ready items when ready.
 */
export function toSyncingAnimePanelView(query: SyncingAnimeQueryState): SyncingAnimePanelView {
  if (query.isPlaceholderData) {
    return { kind: 'loading' };
  }

  const view = toAsyncView(query);
  return view.kind === 'ready' ? { ...view, data: view.data.map(toSyncingAnimePanelViewModel) } : view;
}
