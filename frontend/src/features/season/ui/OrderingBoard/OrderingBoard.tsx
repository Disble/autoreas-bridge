import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { Alert, Button, Card, Chip } from '@heroui/react';
import { OrderingContainer } from './OrderingContainer';
import { OrderingHistoryStates } from './OrderingHistoryStates';
import { OrderingReadOnlyNotice } from './OrderingReadOnlyNotice';
import {
  ORDERING_EMPTY_MESSAGE,
  RAIL_CONTAINER_ID,
  WEEKDAYS,
} from './ordering-board.constants';
import { useOrderingBoard } from './use-ordering-board';
import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';

/**
 * OrderingBoard is the OrderGrid replacement, built on @dnd-kit/react: a left rail of
 * approved animes awaiting a weekday and seven weekday columns. Dragging a card sets
 * BOTH its day and its order (keyboard-accessible, animated, live reshuffle). An anime
 * can air on several days: Duplicate stages a logical copy (same anime, never a second
 * DB row) to drag onto another day; Delete removes a copy but never the last; no two
 * copies share a day. Apply writes the schedule; an applied board is read-only until
 * reopened. All state and the drag reshuffle live in the colocated `useOrderingBoard`.
 *
 * While a past season is open the board shows that season's STORED closure snapshot
 * instead of the live schedule. Its unresolved, not-recorded, and failed states return
 * early and REPLACE the board — an empty rail and grid must never stand in for a record
 * that does not exist. This component stays presentational: the notice, the history
 * states, and each container are colocated child components of their own.
 */
export function OrderingBoard() {
  const {
    rail,
    columns,
    meta,
    instances,
    counts,
    changeCount,
    scheduledCount,
    hasInvalidWeekdayPlacements,
    readOnly,
    isPastSeason,
    isHistoricalLoading,
    historicalRecorded,
    historicalError,
    onDragOver,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
    onOpenPage,
    onCopyPage,
    onOpenFolder,
    onCopyFolder,
  } = useOrderingBoard();

  const notice = (
    <OrderingReadOnlyNotice
      isPastSeason={isPastSeason}
      scheduledCount={scheduledCount}
      onReopen={onReopen}
      onCloseSeason={onCloseSeason}
    />
  );
  const containerActions = {
    readOnly,
    meta,
    counts,
    onDuplicate: duplicate,
    onRemove: removeCard,
    onOpenPage,
    onCopyPage,
    onOpenFolder,
    onCopyFolder,
  };

  // Covers the read in flight, the read that failed, and the season that stored no
  // board; all three must keep the live/stored board off the screen.
  const isStoredBoardUnresolved = historicalError !== undefined || isHistoricalLoading || !historicalRecorded;

  if (isPastSeason && isStoredBoardUnresolved) {
    return (
      <section className="flex flex-col gap-4">
        {notice}
        <OrderingHistoryStates
          isHistoricalLoading={isHistoricalLoading}
          historicalRecorded={historicalRecorded}
          historicalError={historicalError}
        />
      </section>
    );
  }

  return (
    <DragDropProvider onDragOver={onDragOver}>
      <section className="flex flex-col gap-4">
        {readOnly ? notice : null}
        {hasInvalidWeekdayPlacements && !readOnly && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>Each weekday column may contain one card per anime. Fix duplicate weekday cards before saving or applying.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <div className="flex flex-col gap-4 lg:flex-row">
          <Card className="lg:w-56 lg:shrink-0">
            <Card.Header>
              <Card.Title>Approved to place ({rail.length})</Card.Title>
            </Card.Header>
            <Card.Content>
              <OrderingContainer
                containerId={RAIL_CONTAINER_ID}
                className="min-h-16 rounded-lg border border-border/70 p-2 bg-zinc-800"
                emptyMessage={ORDERING_EMPTY_MESSAGE}
                cards={rail}
                {...containerActions}
              />
            </Card.Content>
          </Card>

          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
            {WEEKDAYS.map((day) => {
              const dayCards = columns[day] ?? [];
              return (
                <Card key={day} className="min-w-0">
                  <Card.Header>
                    <Card.Title>{day}</Card.Title>
                    <Chip size="sm" variant="soft">
                      {dayCards.length}
                    </Chip>
                  </Card.Header>
                  <Card.Content>
                    <OrderingContainer
                      containerId={day}
                      className="flex min-h-24 min-w-0 flex-col gap-2 rounded-lg border border-border/70 p-2 bg-zinc-800"
                      emptyMessage={ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE}
                      cards={dayCards}
                      {...containerActions}
                    />
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        </div>

        {!isPastSeason && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{changeCount} changes</span>
            <Button isDisabled={readOnly || changeCount === 0} variant="tertiary" onPress={onReset}>
              Reset draft
            </Button>
            <Button
              className="ml-auto"
              isDisabled={readOnly || changeCount === 0 || hasInvalidWeekdayPlacements}
              variant="primary"
              onPress={() => void onApply()}
            >
              Apply schedule
            </Button>
          </div>
        )}
      </section>

      <DragOverlay>
        {(source) => (
          <div className="rounded-md border border-accent bg-surface p-2 text-xs text-foreground shadow-lg">
            {instances[String(source.id)]?.name}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
