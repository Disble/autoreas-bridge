import type { OrderingContainerProps, OrderingInstance } from './ordering-board.types';

/** Lane props the grid owns itself, so a caller never supplies them per weekday. */
type OrderingWeekdayLaneOwnedKeys = 'containerId' | 'label' | 'listClassName' | 'emptyMessage' | 'emptyState' | 'showNewcomerTag' | 'cards';

/**
 * Props for the seven-weekday grid: the card actions every lane hands down to its
 * cards, plus the cards each weekday holds, keyed by weekday name.
 */
export interface OrderingWeekdayGridProps extends Omit<OrderingContainerProps, OrderingWeekdayLaneOwnedKeys> {
  /** The cards of each weekday in board order; a weekday with no entry renders empty. */
  readonly columns: Readonly<Record<string, readonly OrderingInstance[]>>;
}
