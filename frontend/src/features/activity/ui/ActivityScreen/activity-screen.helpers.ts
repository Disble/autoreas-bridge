import { ACTIVITY_RANGE_END_MARK, ACTIVITY_SCALE_OPTIONS } from '../../feed/activity-feed.constants';
import type { ActivityFeedFilters, ActivityFeedResolvedView } from '../../feed/activity-feed.types';
import type { ActivityFeedDay, ActivityFeedQuery } from '../../feed-source/feed.types';

/**
 * Picks the feed's resolved view: a prompt when no type is selected (no read
 * is made), the empty state when the read found nothing, the rows otherwise.
 *
 * @param query The feed query, undefined when no type is selected.
 * @param days The loaded days.
 * @returns Which resolved view renders.
 */
export function toFeedResolvedView(query: ActivityFeedQuery | undefined, days: readonly ActivityFeedDay[]): ActivityFeedResolvedView {
  if (query === undefined) {
    return 'no-types';
  }
  return days.length === 0 ? 'empty' : 'rows';
}

/**
 * The mark that ends a complete feed: the start of the picked range or of the scale's window.
 *
 * @param filters The filters on screen.
 * @returns `Start of this range` or `Start of the last 24 hours`.
 */
export function toFeedEndMark(filters: ActivityFeedFilters): string {
  if (filters.range !== undefined) {
    return ACTIVITY_RANGE_END_MARK;
  }
  return ACTIVITY_SCALE_OPTIONS.find((option) => option.id === filters.scale)?.end ?? ACTIVITY_RANGE_END_MARK;
}
