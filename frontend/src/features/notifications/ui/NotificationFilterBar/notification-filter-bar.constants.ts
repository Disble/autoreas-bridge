import type { NotificationFilterOption, NotificationViewTab } from './notification-filter-bar.types';

/** Accessible name of the view tab strip. */
export const NOTIFICATION_VIEW_GROUP_LABEL = 'Notification view';

/**
 * The four views the Main artboard's tab strip offers, in its order:
 * `Active · Unread · Read · Archived`. Active and Archived are two different
 * lists with two different bulk actions; Unread and Read narrow the active
 * one. They share a strip because the artboard draws them as one.
 */
export const NOTIFICATION_VIEW_TABS: readonly NotificationViewTab[] = [
  { view: 'active', label: 'Active' },
  { view: 'unread', label: 'Unread' },
  { view: 'read', label: 'Read' },
  { view: 'archived', label: 'Archived' },
];

/** Accessible name of the level dropdown. */
export const NOTIFICATION_LEVEL_FILTER_LABEL = 'Filter by level';

/** What the level dropdown reads while it narrows nothing. */
export const NOTIFICATION_LEVEL_FILTER_PLACEHOLDER = 'All levels';

/**
 * The closed set of levels a producer can report (`notification.Level`), so
 * unlike sources this list is fixed rather than derived. An unrecognized
 * level would render its chip through `resolveLevelChipColor`'s `info`
 * fallback, but it can never be filtered for -- which is correct: a level
 * outside this set is a producer bug, not a filter the user should be offered.
 */
export const NOTIFICATION_LEVEL_OPTIONS: readonly NotificationFilterOption[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

/** Accessible name of the source dropdown. */
export const NOTIFICATION_SOURCE_FILTER_LABEL = 'Filter by source';

/** What the source dropdown reads while it narrows nothing. */
export const NOTIFICATION_SOURCE_FILTER_PLACEHOLDER = 'All sources';
