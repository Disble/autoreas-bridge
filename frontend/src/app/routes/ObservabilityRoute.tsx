import { ObservabilityPanel } from '../../features/dashboard/ui/ObservabilityPanel';

export function ObservabilityRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Observability</h1>
        <p className="text-sm text-muted">Bridge runtime log feed</p>
      </header>
      <div className="min-w-0">
        <ObservabilityPanel />
      </div>
    </div>
  );
}
