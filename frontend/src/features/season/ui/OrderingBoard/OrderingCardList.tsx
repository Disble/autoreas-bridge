import { SortableCard } from './SortableCard';
import type { OrderingCardMeta, OrderingInstance } from './ordering-board.types';

/** Props for one ordering container's ordered list of draggable cards. */
export interface OrderingCardListProps {
  /** The dnd-kit container id the cards live in (a weekday or `RAIL_CONTAINER_ID`). */
  readonly container: string;
  readonly cards: readonly OrderingInstance[];
  readonly readOnly: boolean;
  /** Grade plus desktop-action metadata per anime id; absent entries render a bare card. */
  readonly meta: Readonly<Record<string, OrderingCardMeta>>;
  /** How many cards each anime holds, so the last one can never be removed. */
  readonly counts: Readonly<Record<string, number>>;
  readonly onDuplicate: (animeId: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onOpenPage: (animeId: string) => void;
  readonly onCopyPage: (animeId: string) => void;
  readonly onOpenFolder: (animeId: string) => void;
  readonly onCopyFolder: (animeId: string) => void;
}

/**
 * OrderingCardList renders the draggable cards of one ordering container in order.
 * It is the single place the rail and every weekday column build a `SortableCard`, so
 * both containers cannot drift apart in props or behavior.
 */
export function OrderingCardList({
  container,
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
}: Readonly<OrderingCardListProps>) {
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((instance, index) => (
        <SortableCard
          key={instance.key}
          instance={instance}
          container={container}
          index={index}
          readOnly={readOnly}
          canRemove={(counts[instance.animeId] ?? 0) > 1}
          meta={meta[instance.animeId]}
          onDuplicate={() => onDuplicate(instance.animeId)}
          onRemove={() => onRemove(instance.key)}
          onOpenPage={onOpenPage}
          onCopyPage={onCopyPage}
          onOpenFolder={onOpenFolder}
          onCopyFolder={onCopyFolder}
        />
      ))}
    </ul>
  );
}
