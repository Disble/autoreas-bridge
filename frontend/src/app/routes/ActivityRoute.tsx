import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard';
import { NetworkPanel } from '../../features/network/ui/NetworkPanel/NetworkPanel';

/**
 * ActivityRoute merges the bridge health strip with the network activity
 * log. This is the relocated destination for the removed Status route.
 */
export function ActivityRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Activity</h1>
        <p className="text-sm text-muted">Request and operation activity captured by the bridge</p>
      </header>
      <div className="min-w-0 max-w-2xl">
        <BridgeStatusCard />
      </div>
      <div className="min-w-0">
        <NetworkPanel />
      </div>
    </div>
  );
}
