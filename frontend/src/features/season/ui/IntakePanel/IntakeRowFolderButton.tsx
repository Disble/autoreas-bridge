import folderIcon from '@iconify-icons/solar/folder-with-files-bold-duotone';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { IntakeRowFolderButtonProps } from './intake-panel.types';

/**
 * The round folder button of a creatable intake row: it opens the per-row
 * download-folder picker, shows the folder creation will use as its tooltip,
 * and stays tinted success once the row overrides the default folder.
 */
export function IntakeRowFolderButton({
  rawName,
  folderOverride,
  folderPreview,
  onPickFolder,
}: Readonly<IntakeRowFolderButtonProps>) {
  const folderLabel = folderPreview ?? 'Default download folder';
  return (
    <Tooltip>
      <span title={folderLabel}>
        <Button
          isIconOnly
          aria-label={`Set download folder for ${rawName}`}
          className={folderOverride === undefined ? 'hover:text-success' : 'text-success'}
          size="sm"
          variant="tertiary"
          onPress={onPickFolder}
        >
          <Icon className="size-4" icon={folderIcon} />
        </Button>
      </span>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {folderLabel}
      </Tooltip.Content>
    </Tooltip>
  );
}
