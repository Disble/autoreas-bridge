import { Alert, Button, Spinner, Typography } from '@heroui/react';
import { PairingPanel } from '../../../dashboard/ui/PairingPanel/PairingPanel';
import { SyncingAnimePanel } from '../../../dashboard/ui/SyncingAnimePanel/SyncingAnimePanel';
import { ConnectedDevicesPanel } from '../../../preferences/ui/ConnectedDevicesPanel/ConnectedDevicesPanel';
import {
  DEVICES_WORKSPACE_SUBTITLE,
  DEVICES_WORKSPACE_SYNC_IDLE_LABEL,
  DEVICES_WORKSPACE_SYNC_PENDING_LABEL,
} from './devices-workspace.constants';
import { hasSyncResult } from './devices-workspace.helpers';
import { useDevicesWorkspace } from './use-devices-workspace';

/**
 * Devices page composing pairing, connected devices, syncing-now, and
 * trigger-reconcile sections from existing panels/hooks. This page is the
 * relocated destination for the removed Dashboard and Pairing routes.
 */
export function DevicesWorkspace() {
  const { isSyncing, onTriggerSync, syncResult, syncingAnimeRefreshToken } = useDevicesWorkspace();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Typography type="h1">Devices</Typography>
          <Typography color="muted" type="body-sm">
            {DEVICES_WORKSPACE_SUBTITLE}
          </Typography>
        </div>
        <div className="sm:shrink-0">
          <Button
            isDisabled={isSyncing}
            isPending={isSyncing}
            onPress={() => {
              onTriggerSync().catch(() => undefined);
            }}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {isSyncing ? DEVICES_WORKSPACE_SYNC_PENDING_LABEL : DEVICES_WORKSPACE_SYNC_IDLE_LABEL}
              </>
            )}
          </Button>
        </div>
      </header>

      {hasSyncResult(syncResult) ? (
        <Alert status="success">
          <Alert.Content>
            <Alert.Description>
              <span id="sync-result">{syncResult}</span>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="min-w-0">
        <PairingPanel />
      </div>

      <div className="min-w-0">
        <ConnectedDevicesPanel />
      </div>

      <div className="min-w-0">
        <SyncingAnimePanel refreshToken={syncingAnimeRefreshToken} />
      </div>
    </div>
  );
}
