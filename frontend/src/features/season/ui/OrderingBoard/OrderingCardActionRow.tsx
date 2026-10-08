import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import { getRemoveTooltip } from './ordering-board.helpers';
import type { OrderingCardActionRowProps } from './ordering-board.types';

/**
 * OrderingCardActionRow is the always-visible footer of an ordering card: the muted New
 * tag (weekday newcomers only), the page/folder desktop actions, Duplicate and Remove,
 * each a round icon button that names itself via label and tooltip. Nothing waits for
 * hover. Pressing a button never starts a drag: dnd-kit's default `preventActivation`
 * ignores a pointerdown that lands on an enabled button, so no pointer handler is needed
 * here (a React `stopPropagation` could not reach dnd-kit's native listener anyway).
 */
export function OrderingCardActionRow({
  instance,
  readOnly,
  showNewcomerTag,
  canRemove,
  meta,
  onDuplicate,
  onRemove,
  ...desktopActions
}: Readonly<OrderingCardActionRowProps>) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {showNewcomerTag && instance.isNewcomer && <span className="mr-auto text-xs text-muted">New</span>}
      {meta !== undefined && (
        <AnimeDesktopActions
          animeId={instance.animeId}
          name={instance.name}
          hasPage={meta.hasPage}
          hasFolder={meta.hasFolder}
          pageUrl={meta.pageUrl}
          folderPath={meta.folderPath}
          {...desktopActions}
        />
      )}
      <Tooltip delay={0}>
        <Button
          isIconOnly
          isDisabled={readOnly}
          aria-label={`Duplicate ${instance.name} to another day`}
          className="hover:text-accent"
          size="sm"
          variant="tertiary"
          onPress={onDuplicate}
        >
          <Icon icon={copyIcon} className="size-4" />
        </Button>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          Duplicate to another day
        </Tooltip.Content>
      </Tooltip>
      <Tooltip delay={0}>
        <Button
          isIconOnly
          isDisabled={readOnly || !canRemove}
          aria-label={`Remove ${instance.name}`}
          className="hover:text-danger"
          size="sm"
          variant="tertiary"
          onPress={onRemove}
        >
          <Icon icon={trashIcon} className="size-4" />
        </Button>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          {getRemoveTooltip(canRemove)}
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}
