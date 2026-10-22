import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import trashIcon from '@iconify-icons/solar/trash-bin-2-bold-duotone';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ORDERING_DUPLICATE_TOOLTIP, ORDERING_REMOVE_TOOLTIP } from './ordering-board.constants';
import { getRemoveDisabledReason } from './ordering-board.helpers';
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
      <IconActionButton
        ariaLabel={`Duplicate ${instance.name} to another day`}
        icon={copyIcon}
        isDisabled={readOnly}
        tone="accent"
        tooltip={ORDERING_DUPLICATE_TOOLTIP}
        onPress={onDuplicate}
      />
      <IconActionButton
        ariaLabel={`Remove ${instance.name}`}
        disabledReason={getRemoveDisabledReason(canRemove)}
        icon={trashIcon}
        isDisabled={readOnly || !canRemove}
        tone="danger"
        tooltip={ORDERING_REMOVE_TOOLTIP}
        onPress={onRemove}
      />
    </div>
  );
}
