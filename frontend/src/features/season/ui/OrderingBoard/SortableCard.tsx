import { useSortable } from '@dnd-kit/react/sortable';
import { Chip } from '@heroui/react';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { OrderingCardActionRow } from './OrderingCardActionRow';
import type { OrderingItemProps } from './ordering-board.types';

/**
 * SortableCard is one draggable ordering card (@dnd-kit/react sortable). Dragging it
 * sets both its day (which column it lands in) and its order (its position). The cover
 * thumb leads, then the name: clamped to two lines, the full name as its tooltip, beside a fixed-width grade
 * chip. Below it sits the always-visible action row (desktop actions, Duplicate to
 * stage a logical copy for another day, Remove never the anime's last card).
 */
export function SortableCard({ instance, container, index, readOnly, meta, cover, ...actionProps }: Readonly<OrderingItemProps>) {
  const { ref, isDragging } = useSortable({
    id: instance.key,
    index,
    group: container,
    type: 'item',
    accept: 'item',
    disabled: readOnly,
  });
  let cursorClassName = 'cursor-grab';

  if (readOnly) {
    cursorClassName = 'cursor-default';
  } else if (isDragging) {
    cursorClassName = 'cursor-grabbing';
  }

  return (
    <li
      ref={ref}
      style={{ touchAction: 'none', opacity: isDragging ? 0.4 : 1 }}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl bg-default pb-1.5 pl-2.5 pr-2 pt-2 ${cursorClassName}`}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <SeasonCoverThumb {...cover} />
        <span className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]" title={instance.name}>
          {instance.name}
        </span>
        {meta !== undefined && meta.grade >= 1 && (
          <Chip aria-label={`Approval grade ${meta.grade}`} className="w-8 shrink-0 justify-center" size="sm" variant="soft">
            {meta.grade}
          </Chip>
        )}
      </div>
      <OrderingCardActionRow instance={instance} readOnly={readOnly} meta={meta} {...actionProps} />
    </li>
  );
}
