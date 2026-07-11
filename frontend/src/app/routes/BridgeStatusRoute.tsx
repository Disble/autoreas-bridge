import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard/BridgeStatusCard';

/**
 * BridgeStatusRoute renders the focused status card route for local service
 * health without adding route-level business logic.
 */
export function BridgeStatusRoute() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BridgeStatusCard />
    </div>
  );
}
