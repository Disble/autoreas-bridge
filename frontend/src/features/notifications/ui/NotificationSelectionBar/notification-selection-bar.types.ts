import type { NotificationCenterSyncView } from '../NotificationCenterPanel/use-notification-center-sync';

/**
 * Props for the dumb `NotificationSelectionBar` render (CLAUDE.md frontend
 * constraint #1: no hooks, no business logic). The component itself decides
 * whether to render anything at all, based purely on `selectedCount` --
 * satisfying notification-center spec "A selection bar appears only while
 * rows are selected."
 */
export interface NotificationSelectionBarProps {
  /** How many rows are currently selected. Zero means the bar renders nothing. */
  readonly selectedCount: number;
  /**
   * Which archive view the selected rows were listed from. It picks the
   * lifecycle action on offer: archiving a record that is already archived
   * would be a button that does nothing, and neither would restoring one
   * that was never archived.
   */
  readonly view: NotificationCenterSyncView;
  /** Marks every selected row read, then clears the selection. */
  readonly onMarkRead: () => void;
  /** Archives every selected row, then clears the selection. Offered in the active view only. */
  readonly onArchive: () => void;
  /** Un-archives every selected row, then clears the selection. Offered in the archived view only. */
  readonly onRestore: () => void;
  /** Clears the selection without mutating anything. */
  readonly onClearSelection: () => void;
}
