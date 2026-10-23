import { Alert, Button, Typography } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityFeedRow } from './ActivityFeedRow';
import { ActivityFeedSkeleton } from './ActivityFeedSkeleton';
import { ACTIVITY_FEED_EMPTY, ACTIVITY_FEED_LOADING_LABEL, ACTIVITY_FEED_LOADING_MORE_LABEL, ACTIVITY_FEED_NO_TYPES } from './activity-feed-view.constants';
import type { ActivityFeedProps } from './activity-feed-view.types';

/**
 * The feed: day groups with sticky headers, newest first, in a scroll
 * container that reads the next page near its bottom. Loading, empty and
 * failure are exclusive. A complete feed ends with its start mark.
 */
export function ActivityFeed({ status, resolvedView, days, hasMore, isLoadingMore, endMark, onScroll, onSelectRow, onRetry }: ActivityFeedProps) {
  if (status === 'loading') {
    return <ActivityFeedSkeleton label={ACTIVITY_FEED_LOADING_LABEL} labelId="activity-feed-loading" />;
  }
  if (status === 'failed') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Activity could not read its feed</Alert.Title>
          <Alert.Description>The rest of the app keeps working.</Alert.Description>
          <Button className="mt-2 self-start" onPress={onRetry} size="sm" variant="secondary">
            Try again
          </Button>
        </Alert.Content>
      </Alert>
    );
  }
  if (resolvedView !== 'rows') {
    const copy = resolvedView === 'no-types' ? ACTIVITY_FEED_NO_TYPES : ACTIVITY_FEED_EMPTY;
    return <AirisEmptyState description={copy.description} kind="filtered" size="section" title={copy.title} />;
  }
  return (
    <div aria-busy={isLoadingMore} className="flex max-h-[36rem] min-h-0 flex-col overflow-y-auto" data-testid="activity-feed-scroll" onScroll={onScroll}>
      {days.map((day) => (
        <section aria-label={day.label} className="flex flex-col" key={day.key}>
          <div className="sticky top-0 z-10 bg-surface py-1.5">
            <Typography color="muted" type="body-sm">
              {day.label}
            </Typography>
          </div>
          <ul className="flex flex-col">
            {day.rows.map((row) => (
              <li key={row.key}>
                <ActivityFeedRow onSelect={onSelectRow} row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {isLoadingMore ? <ActivityFeedSkeleton label={ACTIVITY_FEED_LOADING_MORE_LABEL} labelId="activity-feed-loading-more" /> : null}
      {hasMore ? null : (
        <Typography className="py-3 text-center" color="muted" type="body-xs">
          {endMark}
        </Typography>
      )}
    </div>
  );
}
