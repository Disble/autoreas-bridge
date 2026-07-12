import { Alert, Button, Spinner } from '@heroui/react';
import { BridgeStatusCard } from '../BridgeStatusCard/BridgeStatusCard';
import { ObservabilityPanel } from '../ObservabilityPanel/ObservabilityPanel';
import { PairingPanel } from '../PairingPanel/PairingPanel';
import { SyncingAnimePanel } from '../SyncingAnimePanel/SyncingAnimePanel';
import {
  BRIDGE_DASHBOARD_SUBTITLE,
  BRIDGE_DASHBOARD_SYNC_IDLE_LABEL,
  BRIDGE_DASHBOARD_SYNC_PENDING_LABEL,
  BRIDGE_DASHBOARD_TITLE,
  BRIDGE_DASHBOARD_VERSION,
} from './bridge-dashboard.constants';
import { hasSyncResult } from './bridge-dashboard.helpers';
import { useBridgeDashboard } from './use-bridge-dashboard';

/** Top-level dashboard view composing the status, pairing, and observability panels. */
export function BridgeDashboard() {
  const { isSyncing, onTriggerSync, syncResult, syncingAnimeRefreshToken } = useBridgeDashboard();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {BRIDGE_DASHBOARD_TITLE}
          </h1>
          <p className="text-sm text-muted">{BRIDGE_DASHBOARD_SUBTITLE}</p>
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
                {isSyncing ? BRIDGE_DASHBOARD_SYNC_PENDING_LABEL : BRIDGE_DASHBOARD_SYNC_IDLE_LABEL}
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

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="min-w-0">
          <BridgeStatusCard />
        </div>
        <div className="min-w-0">
          <PairingPanel />
        </div>
      </div>

      <div className="min-w-0">
        <SyncingAnimePanel refreshToken={syncingAnimeRefreshToken} />
      </div>

      <div className="min-w-0">
        <ObservabilityPanel />
      </div>

      <footer className="pt-2 text-left text-xs text-muted">{BRIDGE_DASHBOARD_VERSION}</footer>
    </div>
  );
}
