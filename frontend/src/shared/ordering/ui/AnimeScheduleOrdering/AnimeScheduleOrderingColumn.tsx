import { useDroppable } from '@dnd-kit/react';
import type { AnimeScheduleOrderingColumnProps } from './anime-schedule-ordering.types';

/** Registers one schedule destination as a dnd-kit drop target. */
export function AnimeScheduleOrderingColumn({ containerId, className, children }: Readonly<AnimeScheduleOrderingColumnProps>) {
  const { ref } = useDroppable({ id: containerId, type: 'column', accept: 'item' });
  return <div ref={ref} className={className}>{children}</div>;
}
