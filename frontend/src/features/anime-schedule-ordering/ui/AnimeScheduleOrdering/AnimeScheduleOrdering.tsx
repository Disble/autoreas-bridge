import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { Alert, Button, Card, Chip, ScrollShadow, Typography } from '@heroui/react';
import { AnimeScheduleOrderingCard } from './AnimeScheduleOrderingCard';
import { AnimeScheduleOrderingColumn } from './AnimeScheduleOrderingColumn';
import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE, ANIME_SCHEDULE_ORDERING_MODAL_TITLE } from './anime-schedule-ordering.constants';
import type { AnimeScheduleOrderingProps } from './anime-schedule-ordering.types';
import { useAnimeScheduleOrdering } from './use-anime-schedule-ordering';

/**
 * Renders the shared schedule-ordering board used by the editor modal while keeping
 * all draft logic inside the colocated hook.
 */
export function AnimeScheduleOrdering(props: Readonly<AnimeScheduleOrderingProps>) {
  const { weekdayColumns, specialColumns, changeCount, validationMessage, onDragOver, onDuplicate, onRemove, onReset, onApply, canRemove, getOverlayName } = useAnimeScheduleOrdering(props);

  return (
    <DragDropProvider onDragOver={onDragOver}>
      <section className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Typography type="h4">{ANIME_SCHEDULE_ORDERING_MODAL_TITLE}</Typography>
            <Typography color="muted" type="body-sm">Edit the full active-anime draft across weekdays and special queues.</Typography>
          </div>
          {props.onClose !== undefined && <Button variant="tertiary" onPress={props.onClose}>Close</Button>}
        </div>

        {props.feedback !== undefined && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Schedule feedback</Alert.Title>
              <Alert.Description>{props.feedback}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {validationMessage !== undefined && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Invalid draft</Alert.Title>
              <Alert.Description>{validationMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <ScrollShadow className="min-h-0 flex-1" hideScrollBar>
          <div aria-label="Weekday schedule row" className="grid gap-3 lg:grid-cols-7 md:grid-cols-3">
            {weekdayColumns.map((column) => (
              <Card key={column.id}>
                <Card.Header>
                  <Card.Title>{column.label}</Card.Title>
                  <Chip size="sm" variant="soft">{column.cards.length}</Chip>
                </Card.Header>
                <Card.Content>
                  <AnimeScheduleOrderingColumn className="min-h-24 rounded-lg border border-border/70 p-2 bg-zinc-800" containerId={column.id}>
                    {column.cards.length === 0 ? (
                      <Typography color="muted" type="body-sm">{ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE}</Typography>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {column.cards.map((instance, index) => (
                          <AnimeScheduleOrderingCard
                            key={instance.key}
                            canRemove={canRemove(instance.animeId)}
                            containerId={column.id}
                            index={index}
                            instance={instance}
                            onDuplicate={() => onDuplicate(instance.animeId)}
                            onRemove={() => onRemove(instance.key)}
                          />
                        ))}
                      </ul>
                    )}
                  </AnimeScheduleOrderingColumn>
                </Card.Content>
              </Card>
            ))}
          </div>
          <div aria-label="Special queue row" className="mt-4 grid gap-4 md:grid-cols-3">
            {specialColumns.map((column) => (
              <Card key={column.id}>
                <Card.Header><Card.Title>{column.label}</Card.Title><Chip size="sm" variant="soft">{column.cards.length}</Chip></Card.Header>
                <Card.Content>
                  <AnimeScheduleOrderingColumn className="min-h-24 rounded-lg border border-border p-2 bg-zinc-800" containerId={column.id}>
                    {column.cards.length === 0 ? <Typography color="muted" type="body-sm">{ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE}</Typography> : (
                      <ul className="flex flex-col gap-2">
                        {column.cards.map((instance, index) => <AnimeScheduleOrderingCard key={instance.key} canRemove={canRemove(instance.animeId)} containerId={column.id} index={index} instance={instance} onDuplicate={() => onDuplicate(instance.animeId)} onRemove={() => onRemove(instance.key)} />)}
                      </ul>
                    )}
                  </AnimeScheduleOrderingColumn>
                </Card.Content>
              </Card>
            ))}
          </div>
        </ScrollShadow>

        <div className="flex items-center gap-3 border-t border-divider pt-4">
          <Typography color="muted" type="body-sm">{changeCount} schedule changes</Typography>
          <Button isDisabled={changeCount === 0 || props.isApplying === true} variant="tertiary" onPress={onReset}>Reset</Button>
          <Button className="ml-auto" isDisabled={changeCount === 0 || validationMessage !== undefined || props.isApplying === true} isPending={props.isApplying === true} variant="primary" onPress={() => void onApply()}>
            Apply schedule
          </Button>
        </div>
      </section>

      <DragOverlay>
        {(source) => (
          <div className="rounded-lg border border-accent bg-content1 px-3 py-2 text-sm text-foreground shadow-lg">
            {getOverlayName(source.id)}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
