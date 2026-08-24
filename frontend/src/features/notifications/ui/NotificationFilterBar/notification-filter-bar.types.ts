import type { NotificationCenterSyncView } from '../NotificationCenterPanel/use-notification-center-sync';

/**
 * Props for the dumb `NotificationFilterBar` render (CLAUDE.md frontend
 * constraint #1: no hooks, no business logic). `searchInput` is the raw,
 * un-debounced text; debouncing is owned entirely by the caller's
 * `useNotificationFilters` hook. The view pair is fully controlled the same
 * way -- the bar renders whichever view the caller says is current and
 * announces presses, it never remembers a view of its own.
 */
export interface NotificationFilterBarProps {
  /** The raw text currently in the search box. */
  readonly searchInput: string;
  /** Fires on every keystroke, before any debounce is applied. */
  readonly onSearchInputChange: (value: string) => void;
  /** Which archive view is currently selected; the matching switch reads as pressed. */
  readonly view: NotificationCenterSyncView;
  /** Fires with the view the user pressed, including a press on the already-selected one. */
  readonly onViewChange: (view: NotificationCenterSyncView) => void;
}
