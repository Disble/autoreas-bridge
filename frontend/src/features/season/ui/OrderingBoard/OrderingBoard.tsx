import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Alert, Button, Card, Chip } from '@heroui/react';
import { DroppableColumn } from './DroppableColumn';
import { ORDERING_EMPTY_MESSAGE, RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import { RAIL, sortableId } from './ordering-board.helpers';
import { SortableCard } from './SortableCard';
import { useOrderingBoard } from './use-ordering-board';

/**
 * OrderingBoard is the OrderGrid replacement: a left rail of approved animes awaiting
 * a weekday and seven weekday columns, built on dnd-kit. Dragging a card sets BOTH its
 * day and its order (keyboard-accessible, animated). An anime can air on several days:
 * Duplicate stages a logical copy (same anime, never a second DB row) to drag onto
 * another day; Delete removes a copy but never the last one; no two copies share a day.
 * Apply writes the schedule; an applied board is read-only until reopened. All state and
 * the drag→placement mapping live in the colocated `useOrderingBoard` hook.
 */
export function OrderingBoard() {
  const { rail, columns, changeCount, scheduledCount, cardCounts, readOnly, activeCard, onDragStart, onDragEnd, duplicate, removeCard, onApply, onReset, onReopen, onCloseSeason } =
    useOrderingBoard();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canRemove = (animeId: string) => (cardCounts[animeId] ?? 0) > 1;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <section className="flex flex-col gap-4">
        {readOnly && (
          <Alert status="success">
            <Alert.Content>
              <Alert.Description>
                Schedule applied — {scheduledCount} animes scheduled. Close the season to turn season mode off (the
                registry stays queryable), or reopen ordering to make corrections.
              </Alert.Description>
            </Alert.Content>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onPress={() => void onReopen()}>
                Reopen ordering
              </Button>
              <Button size="sm" variant="primary" onPress={onCloseSeason}>
                Close season
              </Button>
            </div>
          </Alert>
        )}

        <div className="flex flex-col gap-4 lg:flex-row">
          <Card className="lg:w-56 lg:shrink-0">
            <Card.Header>
              <Card.Title>Approved to place ({rail.length})</Card.Title>
            </Card.Header>
            <Card.Content>
              <DroppableColumn containerId={RAIL_CONTAINER_ID}>
                {rail.length === 0 ? (
                  <p className="text-sm text-muted">{ORDERING_EMPTY_MESSAGE}</p>
                ) : (
                  <SortableContext
                    id={RAIL_CONTAINER_ID}
                    items={rail.map((card) => sortableId(card.animeId, RAIL))}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex flex-col gap-2">
                      {rail.map((card) => (
                        <SortableCard
                          key={card.animeId}
                          card={card}
                          location={RAIL}
                          readOnly={readOnly}
                          canRemove={canRemove(card.animeId)}
                          onRemove={() => removeCard(card.animeId, RAIL)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                )}
              </DroppableColumn>
            </Card.Content>
          </Card>

          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {WEEKDAYS.map((day) => {
              const cards = columns[day] ?? [];
              return (
                <DroppableColumn
                  key={day}
                  containerId={day}
                  className="flex min-h-24 min-w-0 flex-col gap-2 rounded-lg border border-border p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{day}</span>
                    <Chip size="sm" variant="soft">
                      {cards.length}
                    </Chip>
                  </div>
                  <SortableContext
                    id={day}
                    items={cards.map((card) => sortableId(card.animeId, day))}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex flex-col gap-2">
                      {cards.map((card) => (
                        <SortableCard
                          key={card.animeId}
                          card={card}
                          location={day}
                          readOnly={readOnly}
                          canRemove={canRemove(card.animeId)}
                          onDuplicate={() => duplicate(card.animeId)}
                          onRemove={() => removeCard(card.animeId, day)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DroppableColumn>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">{changeCount} changes</span>
          <Button isDisabled={readOnly || changeCount === 0} variant="tertiary" onPress={onReset}>
            Reset draft
          </Button>
          <Button
            className="ml-auto"
            isDisabled={readOnly || changeCount === 0}
            variant="primary"
            onPress={() => void onApply()}
          >
            Apply schedule
          </Button>
        </div>
      </section>

      <DragOverlay>
        {activeCard !== null ? (
          <div className="rounded-md border border-accent bg-surface p-2 text-xs text-foreground shadow-lg">
            {activeCard.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
