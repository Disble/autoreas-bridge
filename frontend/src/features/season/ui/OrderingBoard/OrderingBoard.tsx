import { Alert, Button, Card, Chip, Label, ListBox, Select } from '@heroui/react';
import type { OrderingCard } from '../../../../infrastructure/season-source';
import { ORDERING_EMPTY_MESSAGE, ORDERING_RAIL_VALUE, WEEKDAYS } from './ordering-board.constants';
import { useOrderingBoard } from './use-ordering-board';

/**
 * OrderingBoard is the OrderGrid replacement: a left rail of approved animes
 * awaiting a weekday and seven weekday columns. Each card carries a "Move to…"
 * picker (day or back to the rail) plus up/down reorder — the guaranteed
 * menu-parity interaction (drag-and-drop is a later enhancement). Apply writes the
 * day+order to every changed anime; an applied board is read-only until reopened.
 * All state and derivation live in the colocated `useOrderingBoard` hook.
 */
export function OrderingBoard() {
  const { rail, columns, changeCount, readOnly, moveToDay, moveWithinDay, returnToRail, onApply, onReset, onReopen } =
    useOrderingBoard();

  const renderMovePicker = (card: OrderingCard, inRail: boolean) => (
    <Select
      aria-label={`Move ${card.name}`}
      isDisabled={readOnly}
      placeholder="Move to…"
      onChange={(value) => {
        const target = value?.toString() ?? '';
        if (target === ORDERING_RAIL_VALUE) {
          returnToRail(card.animeId);
        } else if (target !== '') {
          moveToDay(card.animeId, target);
        }
      }}
    >
      <Label className="sr-only">Move to</Label>
      <Select.Trigger className="h-7 min-w-[104px] text-xs">
        <Select.Value>Move to…</Select.Value>
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
          {!inRail && (
            <ListBox.Item id={ORDERING_RAIL_VALUE} textValue="Back to rail">
              ← Back to rail
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  return (
    <section className="flex flex-col gap-4">
      {readOnly && (
        <Alert status="success">
          <Alert.Content>
            <Alert.Description>Schedule applied. Reopen ordering to make corrections.</Alert.Description>
          </Alert.Content>
          <Button size="sm" variant="secondary" onPress={() => void onReopen()}>
            Reopen ordering
          </Button>
        </Alert>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="lg:w-64 lg:shrink-0">
          <Card.Header>
            <Card.Title>Approved to place ({rail.length})</Card.Title>
          </Card.Header>
          <Card.Content>
            {rail.length === 0 ? (
              <p className="text-sm text-muted">{ORDERING_EMPTY_MESSAGE}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rail.map((card) => (
                  <li
                    key={card.animeId}
                    className="flex items-center gap-2 rounded-lg border border-border p-2"
                  >
                    <span className="flex items-center gap-1 truncate text-sm text-foreground">
                      {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
                      {card.name}
                    </span>
                    <span className="ml-auto">{renderMovePicker(card, true)}</span>
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
              <div key={day} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{day}</span>
                  <Chip size="sm" variant="soft">
                    {cards.length}
                  </Chip>
                </div>
                <ul className="flex flex-col gap-2">
                  {cards.map((card) => (
                    <li key={card.animeId} className="flex flex-col gap-1 rounded-md border border-border p-2">
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
                          onPress={() => moveWithinDay(card.animeId, 'up')}
                        >
                          ↑
                        </Button>
                        <Button
                          isDisabled={readOnly}
                          aria-label={`Move ${card.name} down`}
                          size="sm"
                          variant="tertiary"
                          onPress={() => moveWithinDay(card.animeId, 'down')}
                        >
                          ↓
                        </Button>
                        <span className="ml-auto">{renderMovePicker(card, false)}</span>
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
        <Button className="ml-auto" isDisabled={readOnly || changeCount === 0} variant="primary" onPress={() => void onApply()}>
          Apply schedule
        </Button>
      </div>
    </section>
  );
}
