import { Typography } from '@heroui/react';
import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard';
import { ActivityView } from '../../features/network/ui/ActivityView/ActivityView';
import type { ActivityTabId } from '../../features/network/ui/ActivityView/activity-view.types';

/**
 * ActivityRoute merges the bridge health strip with the real captured
 * HTTP transaction view. It is the single destination for the removed
 * Status, Network, and Events routes: the runtime event log now lives in
 * its own `ActivityView` tab (`initialTab="runtime-events"`), and the
 * aggregate overview lives in another — neither adds a route of its own.
 */
export function ActivityRoute({ initialTab = 'transactions' }: Readonly<{ initialTab?: ActivityTabId }>) {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">Activity</Typography>
        <Typography color="muted" type="body-sm">
          Captured HTTP transactions between mobile clients and the bridge
        </Typography>
      </header>
      <div className="min-w-0 max-w-2xl">
        <BridgeStatusCard />
      </div>
      <div className="min-w-0">
        <ActivityView initialTab={initialTab} />
      </div>
    </div>
  );
}
