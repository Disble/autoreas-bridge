import { DroppableColumn } from './DroppableColumn';
import { OrderingCardList } from './OrderingCardList';
import type { OrderingContainerProps } from './ordering-board.types';

/**
 * OrderingContainer is one droppable column of the ordering board: it keeps the drop
 * target registered even while empty, and switches between its empty state (a plain
 * message unless the caller supplies a richer one, or `null` for none) and the draggable card list. The rail and every weekday render through it, so the empty state
 * and the drop behavior cannot drift between containers.
 */
export function OrderingContainer({ containerId, label, listClassName, emptyMessage, emptyState, cards, ...cardProps }: Readonly<OrderingContainerProps>) {
  return (
    <DroppableColumn containerId={containerId} label={label} className="min-w-0 rounded-2xl bg-surface p-2">
      {cards.length === 0 ? (
        (emptyState === undefined ? <p className="rounded-xl border border-dashed border-separator px-1.5 py-4 text-center text-xs text-muted">{emptyMessage}</p> : emptyState)
      ) : (
        <OrderingCardList container={containerId} className={listClassName} cards={cards} {...cardProps} />
      )}
    </DroppableColumn>
  );
}
