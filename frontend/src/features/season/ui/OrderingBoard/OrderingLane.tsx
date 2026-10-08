import { OrderingContainer } from './OrderingContainer';
import type { OrderingContainerProps } from './ordering-board.types';

/**
 * OrderingLane is one labelled lane of the ordering board: a header that sits OUTSIDE
 * the drop zone (the lane's name and its muted card count), then the droppable
 * container itself. Every weekday and the rail render through it, so their headers
 * and drop zones cannot drift apart.
 */
export function OrderingLane(props: Readonly<OrderingContainerProps>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 px-1.5">
        <h3 className="text-sm font-semibold text-foreground">{props.label}</h3>
        <span className="text-xs text-muted">{props.cards.length}</span>
      </div>
      <OrderingContainer {...props} />
    </div>
  );
}
