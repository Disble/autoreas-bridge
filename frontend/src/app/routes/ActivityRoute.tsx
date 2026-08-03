import { Typography } from '@heroui/react';
import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard';
import { ActivityView } from '../../features/network/ui/ActivityView/ActivityView';

/**
 * ActivityRoute merges the bridge health strip with the real captured
 * HTTP transaction view. It is the single destination for the removed
 * Status, Network, and Events routes: the runtime event log now lives in
 * its own `ActivityView` tab (`initialTab="runtime-events"`).
 */
export function ActivityRoute({ initialTab = 'transactions' }: Readonly<{ initialTab?: 'transactions' | 'runtime-events' }>) {
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
