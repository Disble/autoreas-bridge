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
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Content className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{BRIDGE_DASHBOARD_TITLE}</h1>
              <p className="text-base text-muted">{BRIDGE_DASHBOARD_SUBTITLE}</p>
            </div>
            <p className="max-w-2xl text-sm text-muted">
              Monitor service health, pair mobile devices, inspect bridge logs, and trigger sync workflows from one desktop workspace.
            </p>
          </div>

          <div className="min-w-0 lg:w-full lg:max-w-sm">
            <Card className="border border-divider/50 bg-content2/40 shadow-none">
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
          </div>
        </Card.Content>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <BridgeStatusCard />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <PairingPanel />
        </div>

        <div className="min-w-0 2xl:col-span-2">
          <ObservabilityPanel />
        </div>
      </div>

      <Separator />

      <footer className="pb-2 text-left text-xs text-muted sm:text-sm">{BRIDGE_DASHBOARD_VERSION}</footer>
    </div>
  );
}
