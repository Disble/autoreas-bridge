import type { Table } from '@heroui/react';

/** Accessible label for the notification master list. */
export const NOTIFICATION_TABLE_ARIA_LABEL = 'Notifications';

/**
 * The "When" column is the only sortable one, and it defaults to
 * descending with no user interaction (task 3a.2.5) -- it also matches the
 * order the backend's keyset cursor already returns rows in.
 */
export const NOTIFICATION_TABLE_DEFAULT_SORT: Table['ContentProps']['sortDescriptor'] = {
  column: 'when',
  direction: 'descending',
};

/** Leading selection-checkbox column width: the `40px` design.md §9.2's row grid reserves. */
export const NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH = 'w-10';
/** "Source" column width, part of the row grid `40px minmax(0,1fr) 100px 84px` (design.md §9.2). */
export const NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH = 'w-[100px]';
/** "When" column width, part of the same row grid. */
export const NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH = 'w-[84px]';

/** Label shown inside the `Table.LoadMore` sentinel while the next page is fetched. */
export const NOTIFICATION_TABLE_LOAD_MORE_LABEL = 'Loading more…';
