import { toAsyncView } from '../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_BACKUP_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { backupKeys } from '../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../shared/query/use-bridge-query/use-bridge-query';
import { toSyncStatusChipState } from './sync-status-chip.helpers';
import type { SQLiteStatusSource } from './sync-status-chip.types';

/**
 * Drives the rail footer sync-status chip. Reads the SQLite status through the
 * backup module, which serves it as soon as the database opened, and exposes
 * the Devices page as the chip's link target.
 */
export function useSyncStatusChip(source: SQLiteStatusSource = BRIDGE_BACKUP_SOURCE) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: backupKeys.key('sqlite-status'),
    queryFn: () => source.getSQLiteStatus(),
    module: 'backup',
  });

  // 5. Derived State (useMemo)
  const chip = toSyncStatusChipState(toAsyncView(query));
  const isLoading = chip === null;
  const linkTo = '/devices';

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return {
    status: chip?.status ?? '',
    isLoading,
    statusTone: chip?.statusTone ?? 'danger',
    linkTo,
  };
}
