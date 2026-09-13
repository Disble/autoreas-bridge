import type { UIEvent } from 'react';
import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';

/** State returned by `useHistoryTimeline`: accumulated day groups plus keyset paging status. */
export interface HistoryTimelineState {
  /** Accumulated watch-history rows grouped by local calendar day, newest day first. */
  readonly groups: readonly HistoryDayGroup[];
  /** True only while the first page has not resolved yet. */
  readonly isLoading: boolean;
  /** True when a further keyset page is known to exist. */
  readonly hasMore: boolean;
  /** Set when the first page request failed; undefined while loading, empty, or resolved (design D9). */
  readonly error: Error | undefined;
  /** Fetches the next keyset page and appends its rows. */
  readonly fetchNextPage: () => void;
  /** Wired to the scrolling container; fetches the next page on a near-bottom scroll (design D5a). */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
}
