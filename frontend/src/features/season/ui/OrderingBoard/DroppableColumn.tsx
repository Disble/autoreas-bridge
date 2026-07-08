import { useDroppable } from '@dnd-kit/react';
import type { OrderingColumnProps } from './ordering-board.types';

/**
 * DroppableColumn registers a dnd-kit drop target (@dnd-kit/react) so cards can be
 * dropped onto a weekday — or back onto the rail — even when it holds no cards yet.
 * Purely presentational: it forwards the droppable ref and renders its children.
 */
export function DroppableColumn({ containerId, className, children }: Readonly<OrderingColumnProps>) {
  const { ref } = useDroppable({ id: containerId, type: 'column', accept: 'item' });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
