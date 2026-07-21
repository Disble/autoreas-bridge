import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { useSortable } from '@dnd-kit/react/sortable';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import type { OrderingItemProps } from './ordering-board.types';

/**
 * SortableCard is one draggable ordering card (@dnd-kit/react sortable). Dragging it
 * sets both its day (which column it lands in) and its order (its position). A weekday
 * clone also carries Duplicate (stage a logical copy to drag onto another day) and
 * Delete (never the anime's last card); a rail card carries Delete only. Icon buttons
 * announce their action via tooltip — no selectors, no arrows.
 */
export function SortableCard({
  instance,
  container,
  index,
  readOnly,
  canRemove,
  onDuplicate,
  onRemove,
}: Readonly<OrderingItemProps>) {
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
      className={`flex min-w-0 flex-col gap-1 rounded-md border border-border bg-zinc-900 p-2 ${cursorClassName}`}
    >
      <div className="flex min-w-0 items-center gap-1 text-xs text-foreground">
        {instance.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
        <span className="truncate">{instance.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {onDuplicate !== undefined && (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              isDisabled={readOnly}
              aria-label={`Duplicate ${instance.name} to another day`}
              size="sm"
              variant="tertiary"
              onPointerDown={(event) => event.stopPropagation()}
              onPress={onDuplicate}
            >
              <Icon icon={copyIcon} className="size-4" />
            </Button>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              Duplicate to another day
            </Tooltip.Content>
          </Tooltip>
        )}
        <Tooltip delay={0}>
          <Button
            isIconOnly
            isDisabled={readOnly || !canRemove}
            aria-label={`Remove ${instance.name}`}
            size="sm"
            variant="tertiary"
            onPointerDown={(event) => event.stopPropagation()}
            onPress={onRemove}
          >
            <Icon icon={trashIcon} className="size-4" />
          </Button>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            {canRemove ? 'Remove' : 'An anime must stay on at least one day'}
          </Tooltip.Content>
        </Tooltip>
      </div>
    </li>
  );
}
