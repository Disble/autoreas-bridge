/** One exported bundle group's record count, mirroring `app_backup_dto.go`. */
export interface BackupGroupResultDTO {
  readonly name: string;
  readonly recordCount: number;
}

/** Desktop export outcome returned by the `ExportBackup` Wails binding. */
export interface BackupExportResultDTO {
  readonly cancelled: boolean;
  readonly destinationPath: string;
  readonly formatVersion: number;
  readonly createdAt: string;
  readonly groups: readonly BackupGroupResultDTO[];
  readonly bundleChecksum: string;
}

/**
 * Zero-write preview outcome returned by the `PreviewBackupImport` Wails
 * binding: what importing the chosen bundle would do, before any
 * confirmation is possible. Groups reuse `BackupGroupResultDTO` -- an import
 * group's record count is the same shape as an export group's, and a second
 * identical interface would only drift from it over time.
 */
export interface BackupImportPreviewDTO {
  readonly cancelled: boolean;
  readonly bundlePath: string;
  readonly formatVersion: number;
  readonly bridgeVersion: string;
  readonly createdAt: string;
  readonly bundleChecksum: string;
  readonly groups: readonly BackupGroupResultDTO[];
  readonly unknownGroups: readonly string[];
  readonly absentGroups: readonly string[];
  readonly versionNotes: readonly string[];
}

/** Apply outcome returned by the `ConfirmBackupImport` Wails binding. */
export interface BackupImportResultDTO {
  readonly importedGroups: readonly BackupGroupResultDTO[];
  readonly failedGroup: string;
  readonly unattemptedGroups: readonly string[];
  readonly restorePointPath: string;
  readonly errorMessage: string;
}

/** Request/reply port for the backup export and import runtime bindings. */
export interface BackupSource {
  readonly exportBackup: () => Promise<BackupExportResultDTO>;
  readonly previewBackupImport: () => Promise<BackupImportPreviewDTO>;
  readonly confirmBackupImport: (bundleChecksum: string) => Promise<BackupImportResultDTO>;
}
