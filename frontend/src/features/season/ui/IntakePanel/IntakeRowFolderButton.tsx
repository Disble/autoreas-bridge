import folderIcon from '@iconify-icons/solar/folder-with-files-bold-duotone';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import type { IntakeRowFolderButtonProps } from './intake-panel.types';

/**
 * The round folder button of a creatable intake row: it opens the per-row
 * download-folder picker, names that action in its tooltip with the folder
 * creation will use on the second line, and stays tinted success once the row
 * overrides the default folder.
 */
export function IntakeRowFolderButton({
  rawName,
  folderOverride,
  folderPreview,
  onPickFolder,
}: Readonly<IntakeRowFolderButtonProps>) {
  return (
    <IconActionButton
      ariaLabel={`Set download folder for ${rawName}`}
      detail={folderPreview ?? 'Default download folder'}
      icon={folderIcon}
      isTinted={folderOverride !== undefined}
      tone="success"
      tooltip="Set download folder"
      onPress={onPickFolder}
    />
  );
}
