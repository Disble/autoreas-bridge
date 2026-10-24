import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isOutsideElement } from './activity-drawer-dismiss.helpers';

/**
 * Keeps the failure menu's geometry and outside press (S12 M1): it writes the
 * pill's width to `--bw`, which the closed clip-path uses to shrink the menu
 * back into the pill, and closes the open menu on a pointer press outside the
 * pill and its menu. Closing keeps the failure filter on (design, Transitions).
 *
 * @param groupRef The pill and its menu.
 * @param isOpen Whether the menu is open.
 * @param pillWidthKey A value that changes whenever the pill may change width.
 * @param onDismiss Closes the menu.
 */
export function useActivityFailureMenuDismiss(groupRef: RefObject<HTMLDivElement | null>, isOpen: boolean, pillWidthKey: string, onDismiss: () => void): void {
  // 1. Refs
  const onDismissRef = useRef(onDismiss);

  // 7. Effects
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useLayoutEffect(() => {
    const pill = groupRef.current?.querySelector<HTMLElement>('[data-failure-pill]');
    if (pill !== undefined && pill !== null) {
      groupRef.current?.style.setProperty('--bw', `${pill.offsetWidth}px`);
    }
  }, [groupRef, pillWidthKey]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (isOutsideElement(event.target, groupRef.current)) {
        onDismissRef.current();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [groupRef, isOpen]);
}
