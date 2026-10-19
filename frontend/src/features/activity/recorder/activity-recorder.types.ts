import type { UIEvent } from 'react';
import type { ActivityRecorderEntry } from '../activity-source/activity.types';

/** One recorder row with the stable key the list renders it under. */
export interface ActivityRecorderRow {
  /** `source:id`, or `source:live:<sequence>` for a row without an id. */
  readonly key: string;
  /** The recorder row as the bindings returned it. */
  readonly entry: ActivityRecorderEntry;
}

/** Semantic color of a recorder row's status chip. */
export type ActivityRecorderStatusColor = 'default' | 'warning' | 'danger';

/** One recorder row worded for the dumb list. */
export interface ActivityRecorderLineModel {
  /** Stable React key. */
  readonly key: string;
  /** Local time with seconds, `17:31:04`. */
  readonly time: string;
  /** Route of a request, message of an event. */
  readonly title: string;
  /** Secondary facts joined by `·`; empty when none was recorded. */
  readonly detail: string;
  /** HTTP status or outcome of a request, level of an event. */
  readonly statusLabel: string;
  /** Chip color: calm unless the row failed or degraded. */
  readonly statusColor: ActivityRecorderStatusColor;
}

/** The first recorder read: loading, failed, or resolved. */
export type ActivityRecorderRequestStatus = 'loading' | 'failed' | 'ready';

/** Props of the 2-hour recorder view. */
export interface ActivityRecorderProps {
  /** Leaves the recorder for the view that opened it. */
  readonly onBack: () => void;
}

/** Props of the resolved recorder list. */
export interface ActivityRecorderListProps {
  /** The rendered window of rows, newest first. */
  readonly lines: readonly ActivityRecorderLineModel[];
  /** Whether an older page is being read. */
  readonly isLoadingMore: boolean;
  /** Whether the list stopped at its row cap; older rows live in History. */
  readonly isAtCap: boolean;
  /** Grows the window or reads an older page near the bottom. */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
}
