import type { NotificationCenterView } from '../NotificationCenterPanel/notification-center-panel.types';

/** One offered value in a filter dropdown: the raw value the query is built from, plus its label. */
export interface NotificationFilterOption {
  /** The raw backend string (`warning`, `download`) sent in the list request. */
  readonly value: string;
  /** What the dropdown shows for it. */
  readonly label: string;
}

/** One entry in the view tab strip: the view it selects and the label it wears. */
export interface NotificationViewTab {
  readonly view: NotificationCenterView;
  readonly label: string;
}

/**
 * Props for the dumb `NotificationFilterBar` render (CLAUDE.md frontend
 * constraint #1: no hooks, no business logic). `searchInput` is the raw,
 * un-debounced text; debouncing is owned entirely by the caller's
 * `useNotificationFilters` hook. The view strip and both dropdowns are fully
 * controlled the same way -- the bar renders whatever the caller says is
 * current and announces presses, it never remembers a selection of its own.
 */
export interface NotificationFilterBarProps {
  /** The raw text currently in the search box. */
  readonly searchInput: string;
  /** Fires on every keystroke, before any debounce is applied. */
  readonly onSearchInputChange: (value: string) => void;
  /** Which of the four views is currently selected; the matching tab reads as pressed. */
  readonly view: NotificationCenterView;
  /** Fires with the view the user pressed, including a press on the already-selected one. */
  readonly onViewChange: (view: NotificationCenterView) => void;
  /** Levels the list is currently narrowed to; empty means every level. */
  readonly levels: readonly string[];
  /** Fires with the full level set after the user's press, empty once the last one is cleared. */
  readonly onLevelsChange: (levels: readonly string[]) => void;
  /** Sources the list is currently narrowed to; empty means every source. */
  readonly sources: readonly string[];
  /** Fires with the full source set after the user's press, empty once the last one is cleared. */
  readonly onSourcesChange: (sources: readonly string[]) => void;
  /**
   * Which sources the dropdown offers. Derived by the caller from the records
   * actually loaded rather than fixed here: `source` is an open-ended producer
   * string on the wire, so any hardcoded list is wrong the moment a new
   * producer ships -- it would offer a filter that matches nothing, or hide a
   * source the user can see in the table.
   */
  readonly sourceOptions: readonly NotificationFilterOption[];
}
