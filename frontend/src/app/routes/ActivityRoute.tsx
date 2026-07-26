import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard';
import { ActivityView } from '../../features/network/ui/ActivityView/ActivityView';

/**
 * ActivityRoute merges the bridge health strip with the real captured
 * HTTP transaction view (a true Network tab, not the event log -- see
 * `EventsRoute` for the relocated `NetworkPanel` log). This is the
 * relocated destination for the removed Status route.
 */
export function ActivityRoute({ initialTab = 'transactions' }: Readonly<{ initialTab?: 'transactions' | 'runtime-events' }>) {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Activity</h1>
        <p className="text-sm text-muted">Captured HTTP transactions between mobile clients and the bridge</p>
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
