import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { Alert, Button } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { OrderingHistoryStates } from './OrderingHistoryStates';
import { OrderingLane } from './OrderingLane';
import { OrderingReadOnlyNotice } from './OrderingReadOnlyNotice';
import { OrderingWeekdayGrid } from './OrderingWeekdayGrid';
import {
  ORDERING_EMPTY_ACTION_LABEL,
  ORDERING_EMPTY_DESCRIPTION,
  ORDERING_EMPTY_MESSAGE,
  ORDERING_EMPTY_TITLE,
  ORDERING_RAIL_LABEL,
  RAIL_CONTAINER_ID,
} from './ordering-board.constants';
import { useOrderingBoard } from './use-ordering-board';
import type { OrderingBoardProps } from './ordering-board.types';

/**
 * OrderingBoard is the OrderGrid replacement, built on @dnd-kit/react: seven weekday
 * lanes in a grid that wraps to the room the container leaves, each headed outside its drop
 * zone, with the rail of approved animes awaiting a weekday below them. Dragging a card sets
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
export function OrderingBoard({ onNavigate }: Readonly<OrderingBoardProps>) {
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
    errorMessage,
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
    getCoverThumb,
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
    getCoverThumb,
  };

  // A failed request shows the workspace Alert and never an empty state: `null` tells the
  // container to render nothing for an empty rail, `undefined` keeps its plain message.
  const liveRailEmptyState = (
    <AirisEmptyState
      action={{ label: ORDERING_EMPTY_ACTION_LABEL, onPress: () => onNavigate('selection') }}
      description={ORDERING_EMPTY_DESCRIPTION}
      imageSrc={seasonAirisArtwork}
      kind="waiting-on-step"
      size="section"
      title={ORDERING_EMPTY_TITLE}
    />
  );
  const pastRailEmptyState = isPastSeason ? undefined : liveRailEmptyState;
  const railEmptyState = errorMessage === undefined ? pastRailEmptyState : null;

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

        <OrderingWeekdayGrid columns={columns} {...containerActions} />

        <div className="max-w-xl">
          <OrderingLane
            containerId={RAIL_CONTAINER_ID}
            label={ORDERING_RAIL_LABEL}
            listClassName="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-1.5"
            emptyMessage={ORDERING_EMPTY_MESSAGE}
            emptyState={railEmptyState}
            showNewcomerTag={false}
            cards={rail}
            {...containerActions}
          />
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
          <div className="rounded-xl border border-accent bg-default px-2.5 py-2 text-sm font-semibold text-foreground shadow-lg">
            {instances[String(source.id)]?.name}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
