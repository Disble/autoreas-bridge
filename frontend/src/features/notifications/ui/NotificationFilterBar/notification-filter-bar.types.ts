/**
 * Props for the dumb `NotificationFilterBar` render (CLAUDE.md frontend
 * constraint #1: no hooks, no business logic). `searchInput` is the raw,
 * un-debounced text; debouncing is owned entirely by the caller's
 * `useNotificationFilters` hook.
 */
export interface NotificationFilterBarProps {
  /** The raw text currently in the search box. */
  readonly searchInput: string;
  /** Fires on every keystroke, before any debounce is applied. */
  readonly onSearchInputChange: (value: string) => void;
}
