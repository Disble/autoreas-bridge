import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import { sortableId } from './ordering-board.helpers';
import type { SortableCardProps } from './ordering-board.types';

/**
 * SortableCard is one draggable ordering card. Dragging it sets both its day and its
 * order (dnd-kit). A weekday clone also carries Duplicate (stage a logical copy to
 * drag onto another day) and Delete (never the anime's last card); a rail card carries
 * Delete only. Icon buttons show their action as a tooltip — no selectors, no arrows.
 */
export function SortableCard({ card, location, readOnly, canRemove, onDuplicate, onRemove }: Readonly<SortableCardProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId(card.animeId, location),
    disabled: readOnly,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // dnd-kit's PointerSensor needs the element to yield the gesture instead of scrolling.
    touchAction: 'none' as const,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface p-2"
      {...attributes}
      {...listeners}
    >
      <span className="flex min-w-0 items-center gap-1 truncate text-xs text-foreground">
        {card.isNewcomer && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
        {onDuplicate !== undefined ? `${card.orden}. ` : ''}
        {card.name}
      </span>
      <div className="flex items-center gap-1">
        {onDuplicate !== undefined && (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              isDisabled={readOnly}
              aria-label={`Duplicate ${card.name} to another day`}
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
            aria-label={`Remove ${card.name}`}
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
