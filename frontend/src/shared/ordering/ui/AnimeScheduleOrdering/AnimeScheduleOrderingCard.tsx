import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { useSortable } from '@dnd-kit/react/sortable';
import { Chip, Typography } from '@heroui/react';
import { IconActionButton } from '../../../ui/IconActionButton/IconActionButton';
import { ANIME_SCHEDULE_DUPLICATE_TOOLTIP, ANIME_SCHEDULE_LAST_CARD_REASON, ANIME_SCHEDULE_REMOVE_TOOLTIP } from './anime-schedule-ordering.constants';
import type { AnimeScheduleOrderingCardProps } from './anime-schedule-ordering.types';

/**
 * Renders one draggable anime card plus duplicate/remove actions. A press on an
 * enabled button never starts a drag: dnd-kit's default `preventActivation`
 * ignores a pointerdown that lands on one.
 */
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
    cursorClassName = 'cursor-default opacity-60';
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
      {!isLocked && (
        <div className="flex items-center gap-1">
          <IconActionButton ariaLabel={`Duplicate ${instance.name}`} icon={copyIcon} tone="accent" tooltip={ANIME_SCHEDULE_DUPLICATE_TOOLTIP} onPress={onDuplicate} />
          <IconActionButton
            ariaLabel={`Remove ${instance.name}`}
            disabledReason={ANIME_SCHEDULE_LAST_CARD_REASON}
            icon={trashIcon}
            isDisabled={!canRemove}
            tone="danger"
            tooltip={ANIME_SCHEDULE_REMOVE_TOOLTIP}
            onPress={onRemove}
          />
        </div>
      )}
    </li>
  );
}
