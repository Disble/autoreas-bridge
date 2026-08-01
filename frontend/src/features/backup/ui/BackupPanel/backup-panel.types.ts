import type { BackupExportResultDTO, BackupSource } from '../../../../infrastructure/backup-source';

/** The subset of `BackupSource` this feature needs -- export only, never import. */
export type BackupExportSource = Pick<BackupSource, 'exportBackup'>;

/** View-model status the panel renders: which of the five mutually exclusive states it is in. */
export type BackupPanelStatus = 'idle' | 'busy' | 'success' | 'cancelled' | 'error';

/** Inputs `classifyExportOutcome` needs to derive the panel's current status. */
export interface ExportOutcomeInput {
  readonly isExporting: boolean;
  readonly result: BackupExportResultDTO | null;
  readonly errorMessage: string | null;
}
