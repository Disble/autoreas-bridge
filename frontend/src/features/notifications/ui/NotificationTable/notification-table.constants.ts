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

/**
 * Accessible name of the leading dot on a row nobody has read yet. An
 * already-read row carries no counterpart mark at all: the dot is a HeroUI
 * `Badge` overlaid on the title line, so it occupies no layout space and
 * nothing shifts when the row loses it.
 */
export const NOTIFICATION_TABLE_UNREAD_LABEL = 'Unread';

/** Separator between the names on a row's subject line, matching the detail pane's own middot joins. */
export const NOTIFICATION_TABLE_SUBJECT_SEPARATOR = ' · ';

/** Multiplication sign closing the count badge ("3×"), as the Main artboard draws it. */
export const NOTIFICATION_TABLE_ROW_COUNT_SUFFIX = '×';

/**
 * `data-testid` for a row's subject line. Rendering is keyed on the line being
 * `undefined`, so proving the "names nothing" branch renders NOTHING needs an
 * element-presence check: an empty `<p>` and no `<p>` at all look identical to
 * a text query.
 */
export const NOTIFICATION_TABLE_SUBJECTS_TESTID = 'notification-table-subjects';

/** `data-testid` for a row's count badge, for the same element-presence reason as the subject line above. */
export const NOTIFICATION_TABLE_ROW_COUNT_TESTID = 'notification-table-row-count';

/**
 * `data-testid` for a row's level chip. A producer that reported no level
 * would render a chip whose label is the empty string, which is invisible to a
 * text query and indistinguishable from no chip at all -- so proving that
 * branch renders nothing needs an element-presence check.
 */
export const NOTIFICATION_TABLE_LEVEL_CHIP_TESTID = 'notification-table-level-chip';

/** Class carried by an unread row's title, which the Main artboard sets in a heavier weight than a read one's. */
export const NOTIFICATION_TABLE_UNREAD_TITLE_CLASS = 'font-semibold';

/** Class carried by a read row's title: the artboard de-emphasizes it once the record has been seen. */
export const NOTIFICATION_TABLE_READ_TITLE_CLASS = 'text-default-500';
