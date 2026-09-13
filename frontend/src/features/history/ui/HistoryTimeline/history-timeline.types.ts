import type { HistoryDayGroup } from '../../../../shared/watch-history/watch-history.types';

/** State returned by `useHistoryTimeline`: accumulated day groups plus keyset paging status. */
export interface HistoryTimelineState {
  /** Accumulated watch-history rows grouped by local calendar day, newest day first. */
  readonly groups: readonly HistoryDayGroup[];
  /** True only while the first page has not resolved yet. */
  readonly isLoading: boolean;
  /** True when a further keyset page is known to exist. */
  readonly hasMore: boolean;
  /** Fetches the next keyset page and appends its rows. A later slice wires this to scroll (design D5a). */
  readonly fetchNextPage: () => void;
}
