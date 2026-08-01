import type { BackupImportPreviewDTO, BackupImportResultDTO, BackupSource } from '../../../../infrastructure/backup-source';

/** The subset of `BackupSource` this feature needs -- import only, never export. */
export type BackupImportSource = Pick<BackupSource, 'previewBackupImport' | 'confirmBackupImport'>;

/**
 * Phase of the import flow the section is currently in. `previewing` and
 * `applying` are both busy states; `previewed` is the only phase in which a
 * confirmation is possible.
 */
export type BackupImportPhase = 'idle' | 'previewing' | 'previewed' | 'applying' | 'applied' | 'failed';

/** Inputs `classifyImportPhase` needs to derive the section's current phase. */
export interface ImportPhaseInput {
  readonly isPreviewing: boolean;
  readonly isApplying: boolean;
  readonly preview: BackupImportPreviewDTO | null;
  readonly result: BackupImportResultDTO | null;
  readonly errorMessage: string | null;
}

/** Rendered lines derived from a preview, grouped by what each one discloses. */
export interface ImportPreviewSummary {
  readonly groupLines: readonly string[];
  readonly untouchedLine: string | null;
  readonly ignoredLine: string | null;
  readonly versionNoteLines: readonly string[];
}
