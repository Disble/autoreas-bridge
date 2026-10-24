import type { ActivityRowHealth } from '../../feed/activity-feed.types';

/** Icon tile of a row's origin icon: red for a failure, amber for slow, plain otherwise. */
export const ACTIVITY_ROW_TILE_CLASS: Readonly<Record<ActivityRowHealth, string>> = {
  failed: 'bg-danger/[.22] text-[color-mix(in_oklab,var(--danger)_70%,var(--foreground))]',
  slow: 'bg-warning/[.18] text-warning',
  ok: 'bg-default text-muted',
};

/** Detail text of a row: red for a failure. */
export const ACTIVITY_ROW_DETAIL_CLASS: Readonly<Record<ActivityRowHealth, string>> = {
  failed: 'text-[color-mix(in_oklab,var(--danger)_65%,var(--foreground))]',
  slow: 'text-muted',
  ok: 'text-muted',
};

/** Screen-reader label of the first page's loading region. */
export const ACTIVITY_FEED_LOADING_LABEL = 'Loading activity';

/** Screen-reader label of an older page's loading region. */
export const ACTIVITY_FEED_LOADING_MORE_LABEL = 'Loading earlier activity';

/** Empty feed with no type selected (design, Filters). */
export const ACTIVITY_FEED_NO_TYPES = { title: 'Pick at least one type to see activity.', description: 'Turn on a type in the toolbar.' } as const;

/** Empty feed after a read. */
export const ACTIVITY_FEED_EMPTY = { title: 'Nothing in this time range.', description: 'Pick another range, origin or type.' } as const;
