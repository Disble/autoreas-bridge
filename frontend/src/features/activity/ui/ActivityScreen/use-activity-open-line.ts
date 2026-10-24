import { useCallback, useState } from 'react';
import { focusFeedRow } from '../../feed/activity-drawer-dismiss.helpers';
import { feedLineKey, maybeFeedLineKey, stepFeedLine } from '../../feed/activity-feed-rows.helpers';
import type { ActivityFeedRowModel } from '../../feed/activity-feed.types';
import { useActivityDrawerDismiss } from '../../feed/use-activity-drawer-dismiss';
import { useActivityFeedKeyboardScope } from '../../feed/use-activity-feed-keyboard-scope';
import type { ActivityFeedDay, ActivityFeedLine } from '../../feed-source/feed.types';

/**
 * Owns the line the detail drawer shows: opening it from a row, its ↑ / ↓ /
 * Esc keys, and closing it by × or by a press outside the drawer and rows.
 *
 * @param days The loaded feed days ↑ / ↓ step through.
 * @param failureMenu Whether the failure menu is open and how Esc closes it; Esc closes the menu before the drawer.
 * @returns The open line, its key, and the open and close callbacks.
 */
export function useActivityOpenLine(days: readonly ActivityFeedDay[], failureMenu: { readonly isOpen: boolean; readonly onClose: () => void }) {
  // 1. Refs

  // 2. State
  const [openLine, setOpenLine] = useState<ActivityFeedLine | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const openKey = openLine === undefined ? undefined : feedLineKey(openLine);

  // 6. Callbacks (useCallback calling pure helpers)
  const onSelectRow = useCallback((row: ActivityFeedRowModel) => setOpenLine(row.line), []);
  // Esc and the drawer's × give focus back to the row the drawer shows; a press outside keeps its own focus.
  const onCloseDrawer = useCallback(() => {
    focusFeedRow(document, openKey);
    setOpenLine(undefined);
  }, [openKey]);
  const onDismissDrawer = useCallback(() => setOpenLine(undefined), []);
  // The ↑ / ↓ commands exist only while a line is open, so openKey is set whenever these run.
  // Focus moves with the open line, so the focus ring never marks a row the drawer no longer shows.
  const onStepLine = useCallback(
    (delta: number) => {
      const next = stepFeedLine(days, openKey, delta);
      focusFeedRow(document, maybeFeedLineKey(next));
      setOpenLine(next);
    },
    [days, openKey],
  );
  const onPreviousLine = useCallback(() => onStepLine(-1), [onStepLine]);
  const onNextLine = useCallback(() => onStepLine(1), [onStepLine]);

  // 7. Effects
  useActivityFeedKeyboardScope({
    isDrawerOpen: openLine !== undefined,
    onPrevious: onPreviousLine,
    onNext: onNextLine,
    onClose: onCloseDrawer,
    isFailureMenuOpen: failureMenu.isOpen,
    onCloseFailureMenu: failureMenu.onClose,
  });
  useActivityDrawerDismiss(openLine !== undefined, onDismissDrawer);

  return { openLine, openKey, onSelectRow, onCloseDrawer };
}
