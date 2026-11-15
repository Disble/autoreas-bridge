import { useCallback, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../shared/contracts/notification-center.types';
import { BRIDGE_NOTIFICATION_CENTER_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import type { UseNotificationArchiveResult } from './notification-detail.types';

/**
 * Drives the detail pane's archive button against the existing
 * `ArchiveNotifications` binding (`source.archive` through `useBridgeMutation`, injectable so tests can
 * supply a fake — mirrors `use-notification-action.ts`'s own injectable-source
 * pattern). Archiving is the one lifecycle verb the pane itself carries out;
 * the `Lifecycle.dc.html` artboard's other two live on the master list.
 *
 * A press disables the button optimistically and keeps it down once the store
 * confirms — archiving the same record twice is not a second outcome. A failed
 * archive is the exception: the module was not ready or the store failed and
 * nothing was archived, so the button comes back rather than showing the user
 * the shape of a success that did not happen. The in-flight press is guarded by a ref
 * rather than the disabled state alone, since two synchronous presses in the
 * same event can both read the same stale state before React re-renders.
 *
 * What is settled is stored as the RECORD'S ID, not as a boolean, because the
 * pane does not remount between records: pressing another row swaps `detail`
 * while this hook keeps its instance and receives a new `notificationId`. A
 * boolean would carry the previous record's outcome onto the next one and
 * greet it with an archive button that is already down; comparing ids makes
 * the disabled state follow the record, with no reset effect to forget.
 */
export function useNotificationArchive(
  notificationId: number,
  source: NotificationCenterSource = BRIDGE_NOTIFICATION_CENTER_SOURCE,
): UseNotificationArchiveResult {
  // 1. Refs
  const isArchiveInFlightRef = useRef(false);

  // 2. State
  const [settledId, setSettledId] = useState<number | null>(null);

  // 4. Queries/Mutations
  const { mutate: archiveRecord } = useBridgeMutation({
    mutationFn: (id: number) => source.archive([id]),
    onError: () => setSettledId(null),
    onSettled: () => {
      isArchiveInFlightRef.current = false;
    },
  });

  // 5. Derived state
  const isDisabled = settledId === notificationId;

  // 6. Callbacks
  const archive = useCallback(() => {
    if (isDisabled || isArchiveInFlightRef.current) {
      return;
    }

    isArchiveInFlightRef.current = true;
    setSettledId(notificationId);
    archiveRecord(notificationId);
  }, [archiveRecord, isDisabled, notificationId]);

  return { archive, isDisabled };
}
