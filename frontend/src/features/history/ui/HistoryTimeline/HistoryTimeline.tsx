import { Alert, Button, Skeleton } from '@heroui/react';
import { useNavigate } from 'react-router';
import historyAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { formatRowTime } from '../../../../shared/watch-history/watch-history.helpers';
import {
  HISTORY_TIMELINE_EMPTY_DESCRIPTION,
  HISTORY_TIMELINE_EMPTY_TITLE,
  HISTORY_TIMELINE_ERROR_TITLE,
  HISTORY_TIMELINE_LABEL,
  HISTORY_TIMELINE_LOADING_LABEL,
  HISTORY_TIMELINE_ROW_CLASS,
  HISTORY_TIMELINE_SKELETON_ROW_COUNT,
} from './history-timeline.constants';
import { useHistoryTimeline } from './use-history-timeline';

/**
 * Global watch-history timeline (Anime History spec, "Episode Timeline Is
 * Grouped By Day"): one row per watched episode, grouped under a day heading
 * that shows that day's count, newest day and newest row first. The whole
 * row is the keyboard-accessible drill-down affordance to that episode's
 * anime detail. Owns its data via `useHistoryTimeline`.
 *
 * Renders exactly one of three exclusive states (CLAUDE.md FE #14, design
 * D9): a row-shaped skeleton while the first page is unresolved, the surface
 * error `Alert` when it failed, or `AirisEmptyState` when it resolved with
 * zero rows. The row list itself is gated on the same `isLoading`/`error`
 * flags, never on the collection alone, so a state never renders alongside
 * stale content. Appending a further page (design D5a) is additive: it never
 * returns to the skeleton.
 */
export function HistoryTimeline() {
  const navigate = useNavigate();
  const { groups, isLoading, error, onScroll } = useHistoryTimeline();
  const isEmpty = !isLoading && error === undefined && groups.length === 0;

  return (
    <div
      aria-label={HISTORY_TIMELINE_LABEL}
      className="flex max-h-[32rem] min-h-0 flex-col gap-4 overflow-y-auto"
      data-testid="history-timeline-scroll"
      onScroll={onScroll}
    >
      {isLoading ? (
        <div aria-labelledby="history-timeline-loading-label" aria-live="polite" className="flex flex-col gap-3" role="status">
          <span className="sr-only" id="history-timeline-loading-label">{HISTORY_TIMELINE_LOADING_LABEL}</span>
          {Array.from({ length: HISTORY_TIMELINE_SKELETON_ROW_COUNT }, (_unused, index) => (
            <div className={HISTORY_TIMELINE_ROW_CLASS} data-testid="history-timeline-skeleton-row" key={index}>
              <span className="flex flex-col gap-1">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </span>
              <Skeleton className="h-3 w-10 rounded" />
            </div>
          ))}
        </div>
      ) : null}

      {error === undefined ? null : (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{HISTORY_TIMELINE_ERROR_TITLE}</Alert.Title>
            <Alert.Description>{error.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {isEmpty ? (
        <AirisEmptyState
          description={HISTORY_TIMELINE_EMPTY_DESCRIPTION}
          imageSrc={historyAirisArtwork}
          title={HISTORY_TIMELINE_EMPTY_TITLE}
        />
      ) : null}

      {isLoading || error !== undefined || isEmpty
        ? null
        : groups.map((group) => (
          <section key={group.dayKey}>
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {group.heading} ({group.count})
            </h2>
            <ul className="flex flex-col gap-1">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <Button
                    className={HISTORY_TIMELINE_ROW_CLASS}
                    variant="outline"
                    onPress={() => {
                      void navigate(`/catalog/detail/${entry.animeId}`);
                    }}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{entry.animeName}</span>
                      <span className="text-xs text-muted">Episode {entry.episode}</span>
                    </span>
                    <span className="text-xs text-muted">{formatRowTime(entry.watchedAtMs)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
