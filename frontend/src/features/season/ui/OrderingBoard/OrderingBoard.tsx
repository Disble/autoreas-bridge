import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { Alert, Button, Card, Chip, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import type { DragEvent } from 'react';
import { ORDERING_EMPTY_MESSAGE, WEEKDAYS } from './ordering-board.constants';
import { RAIL } from './ordering-board.helpers';
import { useOrderingBoard } from './use-ordering-board';

/**
 * OrderingBoard is the OrderGrid replacement: a left rail of approved animes
 * awaiting a weekday and seven weekday columns. Drag a card to set BOTH its day and
 * its order — drag is the whole interaction. An anime can air on several days at
 * once: Duplicate stages a logical copy (same anime, never a second DB row) to drag
 * onto another day; Delete removes a copy (never the last one). No two copies of an
 * anime may share a day. Apply writes the day+order to every changed anime; an
 * applied board is read-only until reopened. All state lives in `useOrderingBoard`.
 */
export function OrderingBoard() {
  const { rail, columns, changeCount, scheduledCount, cardCounts, readOnly, moveClone, duplicate, removeCard, onApply, onReset, onReopen, onCloseSeason } =
    useOrderingBoard();

  const onCardDragStart = (event: DragEvent, animeId: string, source: string) => {
    event.dataTransfer.setData('text/plain', `${animeId}|${source}`);
    event.dataTransfer.effectAllowed = 'move';
  };
  const dragged = (event: DragEvent): { animeId: string; source: string } => {
    const [animeId, source = RAIL] = event.dataTransfer.getData('text/plain').split('|');
    return { animeId, source };
  };

  const iconButton = (label: string, icon: typeof copyIcon, onPress: () => void, isDisabled = false) => (
    <Tooltip delay={0}>
      <Button isIconOnly isDisabled={readOnly || isDisabled} aria-label={label} size="sm" variant="tertiary" onPress={onPress}>
        <Icon icon={icon} className="size-4" />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {label}
      </Tooltip.Content>
    </Tooltip>
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
        <Card className="lg:w-56 lg:shrink-0">
          <Card.Header>
            <Card.Title>Approved to place ({rail.length})</Card.Title>
          </Card.Header>
          <Card.Content
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (!readOnly) {
                const { animeId, source } = dragged(event);
                moveClone(animeId, source, RAIL, 0);
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
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2"
                    draggable={!readOnly}
                    onDragStart={(event) => onCardDragStart(event, card.animeId, RAIL)}
                  >
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm text-foreground">
                      {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
                      {card.name}
                    </span>
                    <span className="ml-auto shrink-0">
                      {iconButton(`Remove ${card.name}`, trashIcon, () => removeCard(card.animeId, RAIL), (cardCounts[card.animeId] ?? 0) <= 1)}
                    </span>
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
                className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  if (!readOnly) {
                    const { animeId, source } = dragged(event);
                    moveClone(animeId, source, day, Number.MAX_SAFE_INTEGER);
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
                      className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-2"
                      draggable={!readOnly}
                      onDragStart={(event) => onCardDragStart(event, card.animeId, day)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.stopPropagation();
                        if (!readOnly) {
                          const { animeId, source } = dragged(event);
                          moveClone(animeId, source, day, index);
                        }
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1 truncate text-xs text-foreground">
                        {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
                        {card.orden}. {card.name}
                      </span>
                      <div className="flex items-center gap-1">
                        {iconButton(`Duplicate ${card.name} to another day`, copyIcon, () => duplicate(card.animeId))}
                        {iconButton(`Remove ${card.name} from ${day}`, trashIcon, () => removeCard(card.animeId, day), (cardCounts[card.animeId] ?? 0) <= 1)}
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
