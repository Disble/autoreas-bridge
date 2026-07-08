import { useDroppable } from '@dnd-kit/core';
import type { DroppableColumnProps } from './ordering-board.types';

/**
 * DroppableColumn registers a dnd-kit drop target so cards can be dropped onto a
 * weekday (or the rail) even when it holds no sortable items yet. Purely presentational:
 * it forwards the droppable ref and renders its children.
 */
export function DroppableColumn({ containerId, className, children }: Readonly<DroppableColumnProps>) {
  const { setNodeRef } = useDroppable({ id: containerId });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}
