import { useCallback, useMemo, useState } from 'react';
import type {
  NotificationCenterSource,
  NotificationMutationResult,
  NotificationRow,
} from '../../../../shared/contracts/notification-center.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import type { NotificationTableSelection } from '../NotificationTable/notification-table.types';

/** Everything `useNotificationSelection` needs from its caller. */
export interface NotificationSelectionInput {
  readonly source: NotificationCenterSource;
  readonly rows: readonly NotificationRow[];
  /** Called once a bulk action's mutation settles, so the caller can refetch the list and the unread count. */
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

/** One bulk action: the ids it acts on and the source method that acts on them. */
interface NotificationBulkMutation {
  readonly ids: readonly number[];
  readonly mutate: (ids: readonly number[]) => Promise<NotificationMutationResult>;
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
 * bar's bulk actions (mark read, archive, restore), run through
 * `useBridgeMutation`. Every action clears the selection and calls `onMutated`
 * once its mutation settles, so the caller can refetch the list and the unread
 * count instead of leaving them showing stale, already-mutated rows --
 * satisfying notification-center spec "A selection bar appears only while rows
 * are selected" together with `NotificationSelectionBar`'s own render guard,
 * which reads `selectedCount`.
 *
 * The unread count is read again after every action, archive and restore
 * included: `Store.Archive` marks the records it archives read as a side
 * effect, and restore moves records back into the view the badge counts, so
 * only the count the server computes can be trusted.
 *
 * Archive and restore are two views' worth of the same gesture and are never
 * offered together: which one the selection bar shows follows the panel's
 * current view (`NotificationSelectionBar`'s `view` prop).
 */
export function useNotificationSelection(input: Readonly<NotificationSelectionInput>): NotificationSelectionResult {
  const { source, rows, onMutated } = input;

  // 2. State
  const [selectedKeys, setSelectedKeys] = useState<NotificationTableSelection>(new Set());

  // 4. Queries/Mutations
  // The three bulk actions differ only in which source method they call, so
  // they share one mutation rather than three copies of the same
  // settle-then-clear-then-refetch sequence -- a sequence whose steps must
  // stay identical across them, since the badge, the selection and the list
  // are the same three things in each case.
  const { mutate: runBulkMutation } = useBridgeMutation<NotificationMutationResult, NotificationBulkMutation>({
    mutationFn: ({ ids, mutate }) => mutate(ids),
    onSettled: () => {
      setSelectedKeys(new Set());
      onMutated();
    },
  });

  // 5. Derived state
  const selectedCount = useMemo(() => toSelectedIds(selectedKeys, rows).length, [selectedKeys, rows]);

  // 6. Callbacks
  const onClearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const runOnSelection = useCallback(
    (mutate: (ids: readonly number[]) => Promise<NotificationMutationResult>) => {
      const ids = toSelectedIds(selectedKeys, rows);
      if (ids.length === 0) {
        return;
      }
      runBulkMutation({ ids, mutate });
    },
    [selectedKeys, rows, runBulkMutation],
  );

  const onMarkRead = useCallback(() => {
    runOnSelection((ids) => source.markRead(ids));
  }, [runOnSelection, source]);

  const onArchive = useCallback(() => {
    runOnSelection((ids) => source.archive(ids));
  }, [runOnSelection, source]);

  const onRestore = useCallback(() => {
    runOnSelection((ids) => source.restore(ids));
  }, [runOnSelection, source]);

  return { selectedKeys, selectedCount, onSelectionChange: setSelectedKeys, onMarkRead, onArchive, onRestore, onClearSelection };
}
