import { NetworkPanel } from '../../features/network/ui/NetworkPanel/NetworkPanel';

/**
 * EventsRoute hosts the unchanged runtime event log (`ObservabilityLogEntry`
 * stream, domains system/anime/bus/sync/websocket/api). Activity now shows
 * real captured HTTP transactions (`ActivityRoute`/`TransactionPanel`); this
 * view keeps the log's own diagnostic lens under its own, honest name.
 */
export function EventsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Events</h1>
        <p className="text-sm text-muted">Runtime event log across the bridge's system, anime, sync, and API domains</p>
      </header>
      <div className="min-w-0">
        <NetworkPanel />
      </div>
    </div>
  );
}
