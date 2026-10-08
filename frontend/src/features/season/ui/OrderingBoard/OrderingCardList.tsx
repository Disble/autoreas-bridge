import { SortableCard } from './SortableCard';
import type { OrderingCardListProps } from './ordering-board.types';

/**
 * OrderingCardList renders the draggable cards of one ordering container in order.
 * It is the single place the rail and every weekday column build a `SortableCard`, so
 * both containers cannot drift apart in props or behavior.
 */
export function OrderingCardList({ container, className, cards, meta, counts, onDuplicate, onRemove, ...cardProps }: Readonly<OrderingCardListProps>) {
  return (
    <ul className={className}>
      {cards.map((instance, index) => (
        <SortableCard
          key={instance.key}
          instance={instance}
          container={container}
          index={index}
          canRemove={(counts[instance.animeId] ?? 0) > 1}
          meta={meta[instance.animeId]}
          onDuplicate={() => onDuplicate(instance.animeId)}
          onRemove={() => onRemove(instance.key)}
          {...cardProps}
        />
      ))}
    </ul>
  );
}
