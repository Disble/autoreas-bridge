import { Button } from '@heroui/react';
import { BACKUP_PANEL_EXPORTING_LABEL, BACKUP_PANEL_EXPORT_LABEL } from './backup-panel.constants';
import { summarizeExportResult } from './backup-panel.helpers';
import { useBackupPanel } from './use-backup-panel';

/**
 * Options "Backup" tab body: exposes the desktop-only backup export action
 * and its outcome. Presentation-only -- the Preferences route already wraps
 * every tab panel in its own Card with the tab's title and description, so
 * this renders bare content, matching DownloadsRootPanel.
 */
export function BackupPanel() {
  const { status, result, errorMessage, onExport } = useBackupPanel();

  return (
    <div className="flex flex-col gap-3">
      <Button isDisabled={status === 'busy'} variant="primary" onPress={onExport}>
        {status === 'busy' ? BACKUP_PANEL_EXPORTING_LABEL : BACKUP_PANEL_EXPORT_LABEL}
      </Button>

      {status === 'success' && result ? <p className="text-sm text-muted">{summarizeExportResult(result)}</p> : null}
      {status === 'error' && errorMessage ? <p className="text-sm text-danger">{errorMessage}</p> : null}
    </div>
  );
}
