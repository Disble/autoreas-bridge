import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { Alert, Button, Card, Chip } from '@heroui/react';
import { DroppableColumn } from './DroppableColumn';
import { ORDERING_EMPTY_MESSAGE, RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import { SortableCard } from './SortableCard';
import { useOrderingBoard } from './use-ordering-board';

/**
 * OrderingBoard is the OrderGrid replacement, built on @dnd-kit/react: a left rail of
 * approved animes awaiting a weekday and seven weekday columns. Dragging a card sets
 * BOTH its day and its order (keyboard-accessible, animated, live reshuffle). An anime
 * can air on several days: Duplicate stages a logical copy (same anime, never a second
 * DB row) to drag onto another day; Delete removes a copy but never the last; no two
 * copies share a day. Apply writes the schedule; an applied board is read-only until
 * reopened. All state and the drag reshuffle live in the colocated `useOrderingBoard`.
 */
export function OrderingBoard() {
  const { rail, columns, instances, counts, changeCount, scheduledCount, readOnly, onDragOver, duplicate, removeCard, onApply, onReset, onReopen, onCloseSeason } =
    useOrderingBoard();

  const canRemove = (animeId: string) => (counts[animeId] ?? 0) > 1;

  return (
    <DragDropProvider onDragOver={onDragOver}>
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
              <DroppableColumn containerId={RAIL_CONTAINER_ID} className="min-h-16">
                {rail.length === 0 ? (
                  <p className="text-sm text-muted">{ORDERING_EMPTY_MESSAGE}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {rail.map((instance, index) => (
                      <SortableCard
                        key={instance.key}
                        instance={instance}
                        container={RAIL_CONTAINER_ID}
                        index={index}
                        showOrder={false}
                        readOnly={readOnly}
                        canRemove={canRemove(instance.animeId)}
                        onRemove={() => removeCard(instance.key)}
                      />
                    ))}
                  </ul>
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
                  <ul className="flex flex-col gap-2">
                    {cards.map((instance, index) => (
                      <SortableCard
                        key={instance.key}
                        instance={instance}
                        container={day}
                        index={index}
                        showOrder
                        readOnly={readOnly}
                        canRemove={canRemove(instance.animeId)}
                        onDuplicate={() => duplicate(instance.animeId)}
                        onRemove={() => removeCard(instance.key)}
                      />
                    ))}
                  </ul>
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
        {(source) => (
          <div className="rounded-md border border-accent bg-surface p-2 text-xs text-foreground shadow-lg">
            {instances[String(source.id)]?.name}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
