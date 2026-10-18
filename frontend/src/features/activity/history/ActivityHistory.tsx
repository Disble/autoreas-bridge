import activityAirisArtwork from '../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityHistoryFailure } from './ActivityHistoryFailure';
import { ActivityHistoryResolved } from './ActivityHistoryResolved';
import { ActivityHistorySkeleton } from './ActivityHistorySkeleton';
import { ActivityWhereFilter } from './ActivityWhereFilter';
import { ACTIVITY_HISTORY_LOADING_LABEL } from './activity-history.constants';
import type { ActivityHistoryProps } from './activity-history.types';
import { useActivityHistory } from './use-activity-history';

/**
 * The History tab, "what changed, and when?": the where filter, the 90-day
 * calendar and the day groups. Loading, failure, first run and the resolved
 * views are exclusive; the filter stays on screen except on first run.
 */
export function ActivityHistory({ onPairPhone }: ActivityHistoryProps) {
  const { where, status, calendar, items, resolvedView, isLoadingMore, onScroll, onWhereChange, showAll, retry } = useActivityHistory();
  const isFirstRun = status === 'ready' && resolvedView === 'first-run';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {isFirstRun ? null : <ActivityWhereFilter onWhereChange={onWhereChange} where={where} />}
      {status === 'loading' ? (
        <div aria-labelledby="activity-history-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="activity-history-loading-label">
            {ACTIVITY_HISTORY_LOADING_LABEL}
          </span>
          <ActivityHistorySkeleton />
        </div>
      ) : null}
      {status === 'failed' ? <ActivityHistoryFailure retry={retry} /> : null}
      {isFirstRun ? (
        <AirisEmptyState
          action={{ label: 'Pair a phone', onPress: onPairPhone }}
          description="Changes, connections and bridge work show here day by day once the phone syncs."
          imageSrc={activityAirisArtwork}
          kind="first-run"
          title="Nothing recorded yet"
        />
      ) : null}
      {status === 'ready' && resolvedView !== 'first-run' ? (
        <ActivityHistoryResolved calendar={calendar} isLoadingMore={isLoadingMore} items={items} onScroll={onScroll} resolvedView={resolvedView} showAll={showAll} />
      ) : null}
    </div>
  );
}
