import { useEffect, useRef } from 'react';
import { isDrawerDismissTarget } from './activity-drawer-dismiss.helpers';

/**
 * Closes the non-modal detail drawer on a pointer press outside both the
 * drawer and the feed rows, while it is open.
 *
 * @param isOpen Whether the drawer shows a line.
 * @param onDismiss Closes the drawer without moving focus.
 */
export function useActivityDrawerDismiss(isOpen: boolean, onDismiss: () => void): void {
  // 1. Refs
  const onDismissRef = useRef(onDismiss);

  // 7. Effects
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (isDrawerDismissTarget(event.target)) {
        onDismissRef.current();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);
}
