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
  /** Marks every selected row read, then clears the selection. */
  readonly onMarkRead: () => void;
  /** Archives every selected row, then clears the selection. */
  readonly onArchive: () => void;
  /** Clears the selection without mutating anything. */
  readonly onClearSelection: () => void;
}
