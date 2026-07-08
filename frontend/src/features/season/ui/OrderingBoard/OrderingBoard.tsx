import { Alert, Button, Card, Chip, Label, ListBox, Select } from '@heroui/react';
import type { DragEvent } from 'react';
import type { OrderingCard } from '../../../../infrastructure/season-source';
import { ORDERING_EMPTY_MESSAGE, WEEKDAYS } from './ordering-board.constants';
import { useOrderingBoard } from './use-ordering-board';

/**
 * OrderingBoard is the OrderGrid replacement: a left rail of approved animes
 * awaiting a weekday and seven weekday columns. Drag a card onto a day (or between
 * days) to place/reorder it; an anime can live on SEVERAL days at once — a clone per
 * column — which is the Legacy multi-day ordering. Each card also carries an
 * "Add to day…" picker (menu/keyboard parity) and per-clone up/down + remove. Apply
 * writes the day+order to every changed anime; an applied board is read-only until
 * reopened. All state and derivation live in the colocated `useOrderingBoard` hook.
 */
export function OrderingBoard() {
  const {
    rail,
    columns,
    changeCount,
    scheduledCount,
    readOnly,
    addToDay,
    moveClone,
    moveWithinDay,
    removeFromDay,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
  } = useOrderingBoard();

  const onCardDragStart = (event: DragEvent, animeId: string, sourceDay: string) => {
    event.dataTransfer.setData('text/plain', `${animeId}|${sourceDay}`);
    event.dataTransfer.effectAllowed = 'move';
  };
  const dragged = (event: DragEvent): { animeId: string; sourceDay: string } => {
    const [animeId, sourceDay = ''] = event.dataTransfer.getData('text/plain').split('|');
    return { animeId, sourceDay };
  };

  const renderAddPicker = (card: OrderingCard) => (
    <Select
      aria-label={`Add ${card.name} to a day`}
      isDisabled={readOnly}
      placeholder="Add to day…"
      onChange={(value) => {
        const target = value?.toString() ?? '';
        if (target !== '') {
          addToDay(card.animeId, target);
        }
      }}
    >
      <Label className="sr-only">Add to day</Label>
      <Select.Trigger className="h-7 min-w-[104px] text-xs">
        <Select.Value>Add to day…</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {WEEKDAYS.map((day) => (
            <ListBox.Item key={day} id={day} textValue={day}>
              {day}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  return (
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
        <Card className="lg:w-64 lg:shrink-0">
          <Card.Header>
            <Card.Title>Approved to place ({rail.length})</Card.Title>
          </Card.Header>
          <Card.Content
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (!readOnly) {
                const { animeId, sourceDay } = dragged(event);
                removeFromDay(animeId, sourceDay);
              }
            }}
          >
            {rail.length === 0 ? (
              <p className="text-sm text-muted">{ORDERING_EMPTY_MESSAGE}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rail.map((card) => (
                  <li
                    key={card.animeId}
                    className="flex items-center gap-2 rounded-lg border border-border p-2"
                    draggable={!readOnly}
                    onDragStart={(event) => onCardDragStart(event, card.animeId, '')}
                  >
                    <span className="flex items-center gap-1 truncate text-sm text-foreground">
                      {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
                      {card.name}
                    </span>
                    <span className="ml-auto">{renderAddPicker(card)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>

        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {WEEKDAYS.map((day) => {
            const cards = columns[day] ?? [];
            return (
              <div
                key={day}
                className="flex flex-col gap-2 rounded-lg border border-border p-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  if (!readOnly) {
                    const { animeId, sourceDay } = dragged(event);
                    moveClone(animeId, sourceDay, day, Number.MAX_SAFE_INTEGER);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{day}</span>
                  <Chip size="sm" variant="soft">
                    {cards.length}
                  </Chip>
                </div>
                <ul className="flex flex-col gap-2">
                  {cards.map((card, index) => (
                    <li
                      key={card.animeId}
                      className="flex flex-col gap-1 rounded-md border border-border p-2"
                      draggable={!readOnly}
                      onDragStart={(event) => onCardDragStart(event, card.animeId, day)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.stopPropagation();
                        if (!readOnly) {
                          const { animeId, sourceDay } = dragged(event);
                          moveClone(animeId, sourceDay, day, index);
                        }
                      }}
                    >
                      <span className="flex items-center gap-1 truncate text-xs text-foreground">
                        {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
                        {card.orden}. {card.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          isDisabled={readOnly}
                          aria-label={`Move ${card.name} up`}
                          size="sm"
                          variant="tertiary"
                          onPress={() => moveWithinDay(card.animeId, day, 'up')}
                        >
                          ↑
                        </Button>
                        <Button
                          isDisabled={readOnly}
                          aria-label={`Move ${card.name} down`}
                          size="sm"
                          variant="tertiary"
                          onPress={() => moveWithinDay(card.animeId, day, 'down')}
                        >
                          ↓
                        </Button>
                        <Button
                          isDisabled={readOnly}
                          aria-label={`Remove ${card.name} from ${day}`}
                          size="sm"
                          variant="tertiary"
                          onPress={() => removeFromDay(card.animeId, day)}
                        >
                          ✕
                        </Button>
                        <span className="ml-auto">{renderAddPicker(card)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
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
  );
}
