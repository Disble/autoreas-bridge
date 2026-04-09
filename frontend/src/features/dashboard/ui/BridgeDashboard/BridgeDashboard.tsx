import { Alert, Button, Card, Separator, Spinner } from '@heroui/react';
import { BridgeStatusCard } from '../BridgeStatusCard';
import { ObservabilityPanel } from '../ObservabilityPanel';
import { PairingPanel } from '../PairingPanel';
import {
  BRIDGE_DASHBOARD_SUBTITLE,
  BRIDGE_DASHBOARD_SYNC_DESCRIPTION,
  BRIDGE_DASHBOARD_SYNC_IDLE_LABEL,
  BRIDGE_DASHBOARD_SYNC_PENDING_LABEL,
  BRIDGE_DASHBOARD_SYNC_TITLE,
  BRIDGE_DASHBOARD_TITLE,
  BRIDGE_DASHBOARD_VERSION,
} from './bridge-dashboard.constants';
import { hasSyncResult } from './bridge-dashboard.helpers';
import { useBridgeDashboard } from './use-bridge-dashboard';

export function BridgeDashboard() {
  const { isSyncing, onTriggerSync, syncResult } = useBridgeDashboard();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className="flex flex-col items-center gap-1 pb-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{BRIDGE_DASHBOARD_TITLE}</h1>
          <p className="text-sm text-muted">{BRIDGE_DASHBOARD_SUBTITLE}</p>
        </header>

        <BridgeStatusCard />

        <PairingPanel />

        <ObservabilityPanel />

        <Card>
          <Card.Header>
            <Card.Title>{BRIDGE_DASHBOARD_SYNC_TITLE}</Card.Title>
            <Card.Description>{BRIDGE_DASHBOARD_SYNC_DESCRIPTION}</Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            <Button fullWidth isDisabled={isSyncing} isPending={isSyncing} onPress={onTriggerSync}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isSyncing ? BRIDGE_DASHBOARD_SYNC_PENDING_LABEL : BRIDGE_DASHBOARD_SYNC_IDLE_LABEL}
                </>
              )}
            </Button>
            {hasSyncResult(syncResult) ? (
              <Alert status="success">
                <Alert.Content>
                  <Alert.Description>
                    <span id="sync-result">{syncResult}</span>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </Card.Content>
        </Card>

        <Separator />

        <footer className="pb-4 text-center text-xs text-muted">{BRIDGE_DASHBOARD_VERSION}</footer>
      </div>
    </div>
  );
}
