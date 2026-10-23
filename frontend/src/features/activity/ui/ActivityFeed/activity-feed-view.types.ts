import type { UIEvent } from 'react';
import type { ActivityFeedDayModel, ActivityFeedResolvedView, ActivityFeedRowModel, ActivityReadStatus } from '../../feed/activity-feed.types';

/** Props of the feed list. */
export interface ActivityFeedProps {
  /** Request state of the first page. */
  readonly status: ActivityReadStatus;
  /** Which resolved view renders once the first page is read. */
  readonly resolvedView: ActivityFeedResolvedView;
  /** The day groups, newest first. */
  readonly days: readonly ActivityFeedDayModel[];
  /** Whether an older page remains. */
  readonly hasMore: boolean;
  /** Whether an older page is being read. */
  readonly isLoadingMore: boolean;
  /** The mark that ends a complete feed. */
  readonly endMark: string;
  /** Reads the next page near the bottom of the list. */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** Opens a row in the detail drawer. */
  readonly onSelectRow: (row: ActivityFeedRowModel) => void;
  /** Reads the feed again after a failure. */
  readonly onRetry: () => void;
}

/** Props of one feed row. */
export interface ActivityFeedRowProps {
  /** The row. */
  readonly row: ActivityFeedRowModel;
  /** Opens the row in the detail drawer. */
  readonly onSelect: (row: ActivityFeedRowModel) => void;
}

/** Props of the feed's skeleton rows. */
export interface ActivityFeedSkeletonProps {
  /** Id of the sr-only label the status region is named by. */
  readonly labelId: string;
  /** What the status region announces. */
  readonly label: string;
}
