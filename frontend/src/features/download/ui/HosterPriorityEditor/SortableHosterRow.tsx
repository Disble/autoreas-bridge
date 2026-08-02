import { useSortable } from '@dnd-kit/react/sortable';
import { Chip } from '@heroui/react';
import type { SortableHosterRowProps } from './hoster-priority-editor.types';

/**
 * SortableHosterRow is one draggable hoster row (@dnd-kit/react sortable).
 * dnd-kit drives the gesture with pointer events — which is what works inside
 * Wails WebView2 — and provides keyboard reordering plus screen-reader
 * announcements. Presentation only: the reorder/persist logic lives in
 * `useHosterPriorityEditor`.
 */
export function SortableHosterRow({ row, index }: Readonly<SortableHosterRowProps>) {
  const { ref, isDragging } = useSortable({
    id: row.id,
    index,
    type: 'hoster',
    accept: 'hoster',
  });

  return (
    <li
      ref={ref}
      style={{ touchAction: 'none', opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center justify-between gap-3 rounded-lg border border-divider/60 bg-content1/60 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <span aria-hidden="true" className="p-1 text-muted">
        ⠿
      </span>
      <span className="flex-1 font-medium text-foreground">{row.hoster}</span>
      <Chip color={row.enabled ? 'success' : 'default'} size="sm" variant="soft">
        {row.enabled ? 'Enabled' : 'Disabled'}
      </Chip>
    </li>
  );
}
