import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

/** A coded failure exactly as the desktop error formatter sends it. */
const codedFailure = '{"code":"unavailable","message":"backup is starting"}';

describe('backup-source', () => {
  useIsolatedWailsRuntime();

  it.each([
    ['exportBackup', 'ExportBackup'],
    ['previewBackupImport', 'PreviewBackupImport'],
    ['confirmBackupImport', 'ConfirmBackupImport'],
  ] as const)('%s rejects a coded failure with its plain message, the text the backup panels show', async (method, binding) => {
    const { backupSource } = await import('../backup-source/backup-source.helpers');
    window.go = { desktop: { App: { [binding]: vi.fn().mockRejectedValue(new Error(codedFailure)) } } } as never;

    const call = method === 'confirmBackupImport' ? backupSource.confirmBackupImport('checksum') : backupSource[method]();

    await expect(call).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: 'backup is starting' });
  });

  it.each([['exportBackup'], ['previewBackupImport'], ['confirmBackupImport']] as const)(
    '%s rejects as unavailable when its binding never attaches',
    async (method) => {
      const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../wails-bindings.helpers');
      const { backupSource } = await import('../backup-source/backup-source.helpers');

      const call = method === 'confirmBackupImport' ? backupSource.confirmBackupImport('checksum') : backupSource[method]();
      const assertion = expect(call).rejects.toMatchObject({ message: 'Backup runtime unavailable' });
      await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

      await assertion;
    },
  );

  it('resolves the SQLite status once GetSQLiteStatus attaches', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const { backupSource } = await import('../backup-source/backup-source.helpers');
    const getSQLiteStatus = vi.fn().mockResolvedValue('ok');

    const status = backupSource.getSQLiteStatus();
    window.go = { desktop: { App: { GetSQLiteStatus: getSQLiteStatus } } } as never;
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(status).resolves.toBe('ok');
    expect(getSQLiteStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['starting', '{"code":"unavailable","message":"backup is starting"}', 'unavailable', 'backup is starting'],
    ['failed', '{"code":"failed_precondition","message":"backup: bridge database was not wired"}', 'failed_precondition', 'backup: bridge database was not wired'],
    ['ping failure', '{"code":"internal","message":"database is locked"}', 'internal', 'database is locked'],
  ])('rejects a %s GetSQLiteStatus with its code and plain message, the chip failure text', async (_label, rejection, code, message) => {
    const { backupSource } = await import('../backup-source/backup-source.helpers');
    window.go = { desktop: { App: { GetSQLiteStatus: vi.fn().mockRejectedValue(new Error(rejection)) } } } as never;

    await expect(backupSource.getSQLiteStatus()).rejects.toMatchObject({ name: 'BridgeError', code, message });
  });

  it('rejects GetSQLiteStatus as unavailable when its binding never attaches', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../wails-bindings.helpers');
    const { backupSource } = await import('../backup-source/backup-source.helpers');

    const assertion = expect(backupSource.getSQLiteStatus()).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'unavailable',
      message: 'the GetSQLiteStatus binding is not attached',
    });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await assertion;
  });

  it('passes the confirmed checksum to ConfirmBackupImport and resolves its result', async () => {
    const { backupSource } = await import('../backup-source/backup-source.helpers');
    const result = { importedGroups: [], failedGroup: '', unattemptedGroups: [], restorePointPath: 'p', errorMessage: '' };
    const confirm = vi.fn().mockResolvedValue(result);
    window.go = { desktop: { App: { ConfirmBackupImport: confirm } } } as never;

    await expect(backupSource.confirmBackupImport('checksum')).resolves.toEqual(result);
    expect(confirm).toHaveBeenCalledWith('checksum');
  });
});
