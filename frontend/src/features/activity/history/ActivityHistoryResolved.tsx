import { Card } from '@heroui/react';
import { AirisEmptyState } from '../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityHistoryCalendar } from './ActivityHistoryCalendar';
import { ActivityHistoryDayList } from './ActivityHistoryDayList';
import type { ActivityHistoryResolvedProps } from './activity-history.types';

/**
 * The resolved History card: the calendar above the day groups, or the
 * filtered-empty or quiet state that replaces them.
 */
export function ActivityHistoryResolved({ calendar, resolvedView, items, isLoadingMore, onScroll, showAll }: ActivityHistoryResolvedProps) {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-4">
        <ActivityHistoryCalendar model={calendar} />
        {resolvedView === 'filtered-empty' ? (
          <AirisEmptyState
            action={{ label: 'Show all', onPress: showAll }}
            description="Nothing happened here in the last 90 days."
            kind="filtered"
            size="section"
            title="No activity for this filter"
          />
        ) : null}
        {resolvedView === 'quiet' ? (
          <AirisEmptyState
            description="Only polling reached the bridge; it shows as daily totals in the calendar."
            kind="caught-up"
            size="section"
            title="No changes in the last 90 days"
          />
        ) : null}
        {resolvedView === 'days' ? <ActivityHistoryDayList isLoadingMore={isLoadingMore} items={items} onScroll={onScroll} /> : null}
      </Card.Content>
    </Card>
  );
}
