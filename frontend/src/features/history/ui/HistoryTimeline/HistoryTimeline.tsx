import { Alert, Chip, Header, ListBox, Skeleton } from '@heroui/react';
import historyAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { formatRowTime } from '../../../../shared/watch-history/watch-history.helpers';
import { HistoryFilterBar } from '../HistoryFilterBar/HistoryFilterBar';
import {
  HISTORY_TIMELINE_EMPTY_DESCRIPTION,
  HISTORY_TIMELINE_EMPTY_TITLE,
  HISTORY_TIMELINE_ERROR_TITLE,
  HISTORY_TIMELINE_FILTERED_EMPTY_DESCRIPTION,
  HISTORY_TIMELINE_FILTERED_EMPTY_TITLE,
  HISTORY_TIMELINE_LABEL,
  HISTORY_TIMELINE_LOADING_LABEL,
  HISTORY_TIMELINE_ROW_CLASS,
  HISTORY_TIMELINE_SKELETON_ROW_COUNT,
} from './history-timeline.constants';
import { useHistoryScreen } from './use-history-screen';

/**
 * Global watch-history timeline (Anime History spec, "Episode Timeline Is
 * Grouped By Day"): one row per watched episode, grouped under a day heading
 * that shows that day's count, newest day and newest row first. The whole
 * row is the keyboard-accessible drill-down affordance to that episode's
 * anime detail. Owns its data via `useHistoryScreen`: the filter bar above
 * the list, and a replace-mode selection kept in the URL (design D5, D7).
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
  const { error, filterBar, groups, isFiltered, isLoading, onOpen, onScroll, onSelect, selectedKey } = useHistoryScreen();
  const isEmpty = !isLoading && error === undefined && groups.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <HistoryFilterBar {...filterBar} />
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
            description={isFiltered ? HISTORY_TIMELINE_FILTERED_EMPTY_DESCRIPTION : HISTORY_TIMELINE_EMPTY_DESCRIPTION}
            imageSrc={historyAirisArtwork}
            title={isFiltered ? HISTORY_TIMELINE_FILTERED_EMPTY_TITLE : HISTORY_TIMELINE_EMPTY_TITLE}
          />
        ) : null}

        {isLoading || error !== undefined || isEmpty ? null : (
          <ListBox
            aria-label={HISTORY_TIMELINE_LABEL}
            disallowEmptySelection
            selectedKeys={selectedKey === undefined ? [] : [selectedKey]}
            selectionBehavior="replace"
            selectionMode="single"
            onAction={onOpen}
            onSelectionChange={(keys) => onSelect(Array.from(keys)[0])}
          >
            {groups.map((group) => (
              <ListBox.Section key={group.dayKey}>
                <Header>{group.heading} ({group.count})</Header>
                {group.entries.map((entry) => (
                  <ListBox.Item className={HISTORY_TIMELINE_ROW_CLASS} id={entry.id} key={entry.id} textValue={entry.animeName}>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{entry.animeName}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {entry.statusLabel === undefined || entry.statusColor === undefined ? null : (
                        <Chip color={entry.statusColor} size="sm" variant="soft">{entry.statusLabel}</Chip>
                      )}
                      {entry.cycle > 1 ? <Chip color="warning" size="sm" variant="soft">Rewatch</Chip> : null}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">Episode {entry.episode}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{formatRowTime(entry.watchedAtMs)}</span>
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            ))}
          </ListBox>
        )}
      </div>
    </div>
  );
}
