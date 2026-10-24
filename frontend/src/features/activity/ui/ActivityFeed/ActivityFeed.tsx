import { Alert, Button, Typography } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityFeedRow } from './ActivityFeedRow';
import { ActivityFeedSkeleton } from './ActivityFeedSkeleton';
import { ACTIVITY_FEED_EMPTY, ACTIVITY_FEED_LOADING_LABEL, ACTIVITY_FEED_LOADING_MORE_LABEL, ACTIVITY_FEED_NO_TYPES } from './activity-feed-view.constants';
import type { ActivityFeedProps } from './activity-feed-view.types';

/**
 * The feed: day groups with sticky headers, newest first, in a scroll
 * list that flows with the page, which reads the next page near the page's
 * bottom. Day headers stick to the top of the window, below the mobile app
 * bar. Rows reach 8px into the card's padding (mockup `.ax-row` margin), so
 * their text lines up with the toolbar. Loading, empty and
 * failure are exclusive. A complete feed ends with its start mark.
 */
export function ActivityFeed({ status, resolvedView, days, hasMore, isLoadingMore, endMark, onSelectRow, onCopyRow, onRetry }: ActivityFeedProps) {
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
    <div aria-busy={isLoadingMore} className="flex flex-col" data-testid="activity-feed-list">
      {days.map((day) => (
        <section aria-label={day.label} className="flex flex-col" key={day.key}>
          {/* mb, not pb: the gap under the opaque sticky header stays unpainted, so a row's focus ring shows whole. */}
          <div className="sticky top-14 z-10 mb-1.5 bg-surface pt-4 md:top-0">
            <Typography className="text-[13px] font-semibold leading-normal" color="muted" type="body-sm">
              {day.label}
            </Typography>
          </div>
          <ul className="flex flex-col [&>li+li]:shadow-[0_-1px_0_var(--separator)]">
            {day.rows.map((row) => (
              <li key={row.key}>
                <ActivityFeedRow onCopy={onCopyRow} onSelect={onSelectRow} row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {isLoadingMore ? <ActivityFeedSkeleton label={ACTIVITY_FEED_LOADING_MORE_LABEL} labelId="activity-feed-loading-more" /> : null}
      {hasMore ? null : (
        <p
          className="flex items-center gap-3 pb-1 pt-5 text-xs leading-normal text-muted before:h-px before:flex-1 before:bg-separator after:h-px after:flex-1 after:bg-separator"
          data-feed-end-mark
        >
          {endMark}
        </p>
      )}
    </div>
  );
}
