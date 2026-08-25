import { useCallback, useEffect } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { notificationSource } from '../../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { NO_FACET_FILTER, useNotificationCenterPage } from './use-notification-center-page';
import type { NotificationCenterPageResult, NotificationCenterSyncView } from './use-notification-center-page';

export type { NotificationCenterSyncView } from './use-notification-center-page';

/** Everything `useNotificationCenterSync` needs from its caller. */
export interface NotificationCenterSyncInput {
  readonly source: NotificationCenterSource;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  /** Debounced free-text search (Slice 3b's filter bar); defaults to no filter for callers that predate it. */
  readonly search?: string;
  /** Levels the query is narrowed to; an empty set applies no level filter at all, never "match nothing". */
  readonly levels?: readonly string[];
  /** Sources the query is narrowed to, under the same empty-means-everything contract as `levels`. */
  readonly sources?: readonly string[];
  /** Runtime push stream the list live-refreshes from; defaults to the runtime-backed singleton. */
  readonly pushSource?: NotificationSource;
}

/** The accumulated master-list state `useNotificationCenterSync` exposes. */
export interface NotificationCenterSyncResult extends Omit<NotificationCenterPageResult, 'refreshTopPage' | 'transformRows'> {
  /**
   * Stamps a committed read state onto the loaded rows in place, for the
   * detail pane's own single-record verbs. `isRead` is the state the records
   * are now IN, not the verb that got them there.
   */
  readonly applyReadState: (recordIds: readonly number[], isRead: boolean) => void;
}

/**
 * Removes the records a `notification.archived` event just named from the rows
 * currently on screen.
 *
 * Dropping them in place rather than re-fetching is deliberate: the archived
 * ids are exactly what left the active list, so the list already knows the
 * answer, and a first-page re-fetch would throw a user who has paged three
 * times back to one page -- the same reason `mergeRefreshedRows` exists.
 */
function dropArchivedRows(accumulated: readonly NotificationRow[], archivedIds: readonly number[]): readonly NotificationRow[] {
  const archived = new Set(archivedIds);
  return accumulated.filter((row) => !archived.has(row.id));
}

/**
 * Stamps a read state the caller has just committed onto the rows already on
 * screen, so a record read or put back to unread from the detail pane stops
 * disagreeing with the row beside it.
 *
 * The stamp is a local clock reading, not the store's own `read_at_ms`: the
 * lifecycle mutations answer with an affected count and a fresh unread total
 * and never hand back the timestamp they wrote. Nothing renders the value --
 * `isNotificationRowUnread` only asks whether it is there -- and the next
 * page load replaces it with the authoritative one, so a few milliseconds of
 * drift buys the dot being right immediately.
 *
 * Returns `accumulated` by identity when nothing actually moved, which is what
 * keeps a mutation on an off-screen record, or one landing on the state the
 * rows already carry, from re-rendering the table.
 */
function patchRowsReadState(
  accumulated: readonly NotificationRow[],
  recordIds: readonly number[],
  readAtMs: number | undefined,
): readonly NotificationRow[] {
  const targeted = new Set(recordIds);
  let changed = false;

  const patched = accumulated.map((row) => {
    if (!targeted.has(row.id) || row.readAtMs === readAtMs) {
      return row;
    }
    changed = true;
    return { ...row, readAtMs };
  });

  return changed ? patched : accumulated;
}

/**
 * Layers the notification master list's live updates over
 * `useNotificationCenterPage`'s keyset pagination: the runtime events that
 * change what is on screen without the user asking, and the read state the
 * detail pane commits beside it.
 *
 * It subscribes to the `notification.push` runtime event the rail badge
 * already listens to, so a record that arrives while the panel is open shows
 * up without a remount. The pushed payload is deliberately NOT appended: it
 * is a `Notification`, carrying no persisted record id, and a list keyed by
 * id cannot hold it. The subscription instead re-reads the first page under
 * the current filters and merges it in, which is also what keeps the
 * backend's own ordering and read state authoritative.
 *
 * It subscribes to `notification.archived` for a sharper reason -- that one
 * closes a real defect rather than adding a nicety. Archiving from the detail
 * pane went straight to `ArchiveNotifications` and told nobody, so the record
 * left the store and stayed on screen: the Archived tab showed it while the
 * active list still did too. Listening to the event rather than threading a
 * callback down through the pane covers every archive origin at once (the
 * pane's button, the selection bar, a toast), because the store emits it on
 * every commit.
 *
 * Read state gets no event and wants none. It is a local outcome of a button
 * the user just pressed, not something other surfaces need announced, so the
 * pane reports what it committed and `applyReadState` stamps it on.
 */
export function useNotificationCenterSync(input: Readonly<NotificationCenterSyncInput>): NotificationCenterSyncResult {
  const {
    source,
    view,
    unreadOnly,
    search = '',
    levels = NO_FACET_FILTER,
    sources = NO_FACET_FILTER,
    pushSource = notificationSource,
  } = input;

  // 4. Queries
  const { refreshTopPage, transformRows, ...page } = useNotificationCenterPage({ source, view, unreadOnly, search, levels, sources });

  // 6. Callbacks
  const applyArchivedRecords = useCallback(
    (recordIds: readonly number[]) => {
      // The same event means opposite things on either side of the archive
      // boundary: in the active list the records have LEFT, in the archive
      // they have just ARRIVED. Filtering in the archived view would hide the
      // very row the user switched there to find, so that side refreshes
      // instead -- it has no id-keyed row to synthesise from a bare id list.
      if (view === 'archived') {
        refreshTopPage();
        return;
      }
      transformRows((current) => dropArchivedRows(current, recordIds));
    },
    [refreshTopPage, transformRows, view],
  );

  const applyReadState = useCallback(
    (recordIds: readonly number[], isRead: boolean) => {
      transformRows((current) => patchRowsReadState(current, recordIds, isRead ? Date.now() : undefined));
    },
    [transformRows],
  );

  // 7. Effects
  useEffect(() => {
    return pushSource.subscribe(refreshTopPage);
  }, [pushSource, refreshTopPage]);

  useEffect(() => {
    return pushSource.subscribeArchived(applyArchivedRecords);
  }, [applyArchivedRecords, pushSource]);

  return { ...page, applyReadState };
}
