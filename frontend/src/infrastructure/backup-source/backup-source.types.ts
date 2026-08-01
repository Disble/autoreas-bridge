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

/** Request/reply port for the backup export runtime binding. */
export interface BackupSource {
  readonly exportBackup: () => Promise<BackupExportResultDTO>;
}
