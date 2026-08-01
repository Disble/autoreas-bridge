import type { BackupExportResultDTO } from '../../../../infrastructure/backup-source';

/** View-model status the panel renders: which of the five mutually exclusive states it is in. */
export type BackupPanelStatus = 'idle' | 'busy' | 'success' | 'cancelled' | 'error';

/** Inputs `classifyExportOutcome` needs to derive the panel's current status. */
export interface ExportOutcomeInput {
  readonly isExporting: boolean;
  readonly result: BackupExportResultDTO | null;
  readonly errorMessage: string | null;
}
