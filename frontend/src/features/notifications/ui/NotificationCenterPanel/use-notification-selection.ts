import { useCallback, useMemo, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
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
  return rows.filter((row) => selectedKeys.has(row.id)).map((row) => row.id);
}

/**
 * Owns the notification master list's multi-row selection and the selection
 * bar's bulk actions (mark read, archive). Both actions clear the selection
 * and call `onMutated` once their mutation resolves, so the caller can
 * refetch the list instead of leaving it showing stale, already-mutated
 * rows -- satisfying notification-center spec "A selection bar appears only
 * while rows are selected" together with `NotificationSelectionBar`'s own
 * render guard, which reads `selectedCount`.
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

  const onMarkRead = useCallback(() => {
    const ids = toSelectedIds(selectedKeys, rows);
    if (ids.length === 0) {
      return;
    }
    void source.markRead(ids).then(() => {
      onClearSelection();
      onMutated();
    });
  }, [source, selectedKeys, rows, onClearSelection, onMutated]);

  const onArchive = useCallback(() => {
    const ids = toSelectedIds(selectedKeys, rows);
    if (ids.length === 0) {
      return;
    }
    void source.archive(ids).then(() => {
      onClearSelection();
      onMutated();
    });
  }, [source, selectedKeys, rows, onClearSelection, onMutated]);

  return { selectedKeys, selectedCount, onSelectionChange: setSelectedKeys, onMarkRead, onArchive, onClearSelection };
}
