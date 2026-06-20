import { NetworkPanel } from '../../features/network/ui/NetworkPanel/NetworkPanel';

export function NetworkRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Network</h1>
        <p className="text-sm text-muted">Request and operation activity captured by the bridge</p>
      </header>
      <div className="min-w-0">
        <NetworkPanel />
      </div>
    </div>
  );
}
