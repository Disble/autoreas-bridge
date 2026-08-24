import { useCallback, useMemo, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationMutationResult, NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { applyNotificationMutationUnreadCount } from '../../../../shared/store/notification-store/notification-store.helpers';
import type { NotificationTableSelection } from '../NotificationTable/notification-table.types';

/** Everything `useNotificationSelection` needs from its caller. */
export interface NotificationSelectionInput {
  readonly source: NotificationCenterSource;
  readonly rows: readonly NotificationRow[];
  /** Called once a bulk action's mutation resolves, so the caller can refetch the list (e.g. the sync hook's `refetch`). */
  readonly onMutated: () => void;
}

/** The selection state and bulk-action callbacks `useNotificationSelection` exposes. */
export interface NotificationSelectionResult {
  readonly selectedKeys: NotificationTableSelection;
  readonly selectedCount: number;
  readonly onSelectionChange: (keys: NotificationTableSelection) => void;
  readonly onMarkRead: () => void;
  readonly onArchive: () => void;
  /** Un-archives every selected row -- the archived view's counterpart to `onArchive`. */
  readonly onRestore: () => void;
  readonly onClearSelection: () => void;
}

/**
 * Resolves a `Selection` value (`'all' | Set<Key>`) into the concrete list
 * of numeric ids it currently covers, against the rows presently loaded.
 */
function toSelectedIds(selectedKeys: NotificationTableSelection, rows: readonly NotificationRow[]): number[] {
  if (selectedKeys === 'all') {
    return rows.map((row) => row.id);
  }
  return rows.reduce<number[]>((ids, row) => {
    if (selectedKeys.has(row.id)) {
      ids.push(row.id);
    }
    return ids;
  }, []);
}

/**
 * Owns the notification master list's multi-row selection and the selection
 * bar's bulk actions (mark read, archive, restore). Every action clears the
 * selection and calls `onMutated` once its mutation resolves, so the caller
 * can refetch the list instead of leaving it showing stale, already-mutated
 * rows -- satisfying notification-center spec "A selection bar appears only
 * while rows are selected" together with `NotificationSelectionBar`'s own
 * render guard, which reads `selectedCount`.
 *
 * Each also feeds the mutation's own fresh `unreadCount` into the shared
 * notification store, which is what lowers the rail badge. Archive included:
 * `Store.Archive` marks the records it archives read as a side effect, so an
 * archive that skipped this step would leave the badge standing over
 * records nothing can reach any more. Restore included for the mirror
 * reason: it moves records back into the view the badge counts, so only the
 * count the server just computed can be trusted.
 *
 * Archive and restore are two views' worth of the same gesture and are never
 * offered together: which one the selection bar shows follows the panel's
 * current view (`NotificationSelectionBar`'s `view` prop).
 */
export function useNotificationSelection(input: Readonly<NotificationSelectionInput>): NotificationSelectionResult {
  const { source, rows, onMutated } = input;

  // 2. State
  const [selectedKeys, setSelectedKeys] = useState<NotificationTableSelection>(new Set());

  // 5. Derived state
  const selectedCount = useMemo(() => toSelectedIds(selectedKeys, rows).length, [selectedKeys, rows]);

  // 6. Callbacks
  const onClearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  // The three bulk actions differ only in which source method they call, so
  // they share one runner rather than three copies of the same
  // resolve-then-clear-then-refetch sequence -- a sequence whose steps must
  // stay identical across them, since the badge, the selection and the list
  // are the same three things in each case.
  const runBulkMutation = useCallback(
    (mutate: (ids: readonly number[]) => Promise<NotificationMutationResult>) => {
      const ids = toSelectedIds(selectedKeys, rows);
      if (ids.length === 0) {
        return;
      }
      void mutate(ids).then((result) => {
        applyNotificationMutationUnreadCount(result);
        onClearSelection();
        onMutated();
      });
    },
    [selectedKeys, rows, onClearSelection, onMutated],
  );

  const onMarkRead = useCallback(() => {
    runBulkMutation((ids) => source.markRead(ids));
  }, [runBulkMutation, source]);

  const onArchive = useCallback(() => {
    runBulkMutation((ids) => source.archive(ids));
  }, [runBulkMutation, source]);

  const onRestore = useCallback(() => {
    runBulkMutation((ids) => source.restore(ids));
  }, [runBulkMutation, source]);

  return { selectedKeys, selectedCount, onSelectionChange: setSelectedKeys, onMarkRead, onArchive, onRestore, onClearSelection };
}
