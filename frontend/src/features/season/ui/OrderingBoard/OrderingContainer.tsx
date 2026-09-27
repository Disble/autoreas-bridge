import { DroppableColumn } from './DroppableColumn';
import { OrderingCardList } from './OrderingCardList';
import type { OrderingCardMeta, OrderingInstance } from './ordering-board.types';

/** Props for one droppable ordering container: the rail, or one weekday column. */
export interface OrderingContainerProps {
  /** The dnd-kit droppable container id (a weekday name or `RAIL_CONTAINER_ID`). */
  readonly containerId: string;
  readonly className: string;
  /** Copy shown inside the container while it holds no cards. */
  readonly emptyMessage: string;
  readonly cards: readonly OrderingInstance[];
  readonly readOnly: boolean;
  readonly meta: Readonly<Record<string, OrderingCardMeta>>;
  readonly counts: Readonly<Record<string, number>>;
  readonly onDuplicate: (animeId: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onOpenPage: (animeId: string) => void;
  readonly onCopyPage: (animeId: string) => void;
  readonly onOpenFolder: (animeId: string) => void;
  readonly onCopyFolder: (animeId: string) => void;
}

/**
 * OrderingContainer is one droppable column of the ordering board: it keeps the drop
 * target registered even while empty, and switches between its empty message and the
 * draggable card list. The rail and every weekday render through it, so the empty state
 * and the drop behavior cannot drift between containers.
 */
export function OrderingContainer({
  containerId,
  className,
  emptyMessage,
  cards,
  readOnly,
  meta,
  counts,
  onDuplicate,
  onRemove,
  onOpenPage,
  onCopyPage,
  onOpenFolder,
  onCopyFolder,
}: Readonly<OrderingContainerProps>) {
  return (
    <DroppableColumn containerId={containerId} className={className}>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <OrderingCardList
          container={containerId}
          cards={cards}
          readOnly={readOnly}
          meta={meta}
          counts={counts}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onOpenPage={onOpenPage}
          onCopyPage={onCopyPage}
          onOpenFolder={onOpenFolder}
          onCopyFolder={onCopyFolder}
        />
      )}
    </DroppableColumn>
  );
}
