import { useEffect, useRef } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { AppNotification } from '../../../../shared/contracts/app-notification.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { getSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import { INTAKE_DISCARD_TOAST_ID_PREFIX } from './notification-resolver.constants';

/**
 * Drives the intake discard's Undo toast from the season store's `lastDiscard`:
 * every successful discard pushes one toast naming the row, and its Undo action
 * restores that row and closes the toast. A failed discard records nothing, so it
 * pushes nothing. Each toast is keyed by the discard's sequence, so a StrictMode
 * re-run of the effect cannot open it twice.
 * @param push Pushes a notification through the pipeline.
 * @param remove Closes a tracked toast by its key.
 */
export function useIntakeDiscardResolver(
  push: (notification: AppNotification) => void,
  remove: (key: string | number) => void,
): void {
  // 1. Refs
  const pushRef = useRef(push);
  const removeRef = useRef(remove);
  // 3. Context/3rd Party Hooks
  const lastDiscard = useSeasonStore((state) => state.lastDiscard);

  // 7. Effects
  // Refreshed in an effect rather than during render, like the missed-schedule resolver.
  useEffect(() => {
    pushRef.current = push;
    removeRef.current = remove;
  });

  useEffect(() => {
    if (lastDiscard === null) {
      return;
    }
    const toastKey = `${INTAKE_DISCARD_TOAST_ID_PREFIX}${lastDiscard.sequence}`;
    pushRef.current({
      severity: 'info',
      title: 'Discarded',
      description: lastDiscard.rawName,
      actions: [
        {
          label: 'Undo',
          onPress: () => {
            void getSeasonStoreState().restoreName(seasonSource, lastDiscard.rowId);
            removeRef.current(toastKey);
          },
        },
      ],
      dedupeKey: toastKey,
    });
  }, [lastDiscard]);
}
