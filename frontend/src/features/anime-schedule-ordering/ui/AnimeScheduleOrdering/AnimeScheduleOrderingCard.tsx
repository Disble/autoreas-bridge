import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { Icon } from '@iconify/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { Button, Chip, Tooltip, Typography } from '@heroui/react';
import type { AnimeScheduleOrderingCardProps } from './anime-schedule-ordering.types';

/** Renders one draggable anime card plus duplicate/remove actions. */
export function AnimeScheduleOrderingCard({ instance, containerId, index, canRemove, onDuplicate, onRemove }: Readonly<AnimeScheduleOrderingCardProps>) {
  const isLocked = instance.locked === true;
  const { ref, isDragging } = useSortable({
    id: instance.key,
    index,
    group: containerId,
    type: 'item',
    accept: 'item',
    disabled: isLocked ? { draggable: true } : undefined,
  });

  let cursorClassName = 'cursor-grab';
  if (isDragging) {
    cursorClassName = 'cursor-grabbing opacity-40';
  } else if (isLocked) {
    cursorClassName = 'cursor-default';
  }

  return (
    <li
      ref={ref}
      data-anime-id={instance.animeId}
      data-locked={isLocked ? 'true' : undefined}
      data-origin-anime={instance.originHighlighted ? instance.animeId : undefined}
      className={`flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2 bg-zinc-900 ${instance.originHighlighted ? 'border-accent bg-accent/5' : 'border-border bg-content1'} ${cursorClassName}`}
      style={{ touchAction: isLocked ? undefined : 'none' }}
    >
      <div className="flex items-center gap-2">
        <Typography truncate type="body-sm" weight="semibold">{instance.name}</Typography>
        {instance.originHighlighted && <Chip color="accent" size="sm" variant="soft">Origin</Chip>}
      </div>
      <div className="flex items-center gap-1">
        <Tooltip delay={0}>
          <Button aria-label={`Duplicate ${instance.name}`} isIconOnly size="sm" variant="tertiary" onPointerDown={(event) => event.stopPropagation()} onPress={onDuplicate}>
            <Icon className="size-4" icon={copyIcon} />
          </Button>
          <Tooltip.Content showArrow><Tooltip.Arrow />Duplicate</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button aria-label={`Remove ${instance.name}`} isDisabled={!canRemove} isIconOnly size="sm" variant="tertiary" onPointerDown={(event) => event.stopPropagation()} onPress={onRemove}>
            <Icon className="size-4" icon={trashIcon} />
          </Button>
          <Tooltip.Content showArrow><Tooltip.Arrow />{canRemove ? 'Remove' : 'An anime must stay scheduled at least once'}</Tooltip.Content>
        </Tooltip>
      </div>
    </li>
  );
}
