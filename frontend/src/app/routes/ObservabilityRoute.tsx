import { Card } from '@heroui/react';
import { ObservabilityPanel } from '../../features/dashboard/ui/ObservabilityPanel';

export function ObservabilityRoute() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Content className="flex flex-col gap-4 p-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Observability</h1>
              <p className="text-base text-muted">Bridge runtime log feed</p>
            </div>
            <p className="max-w-3xl text-sm text-muted">
              Wide desktop space should prioritize scanning, pattern recognition, and quick anomaly detection. This route stretches the console region so logs behave like a real operations workspace instead of a narrow feed.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 2xl:min-w-[420px]">
            <Card className="border border-divider/50 bg-content2/40 shadow-none">
              <Card.Content className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-muted">View mode</p>
                <p className="text-sm font-medium text-foreground">Dense desktop feed</p>
              </Card.Content>
            </Card>
            <Card className="border border-divider/50 bg-content2/40 shadow-none">
              <Card.Content className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Priority</p>
                <p className="text-sm font-medium text-foreground">Recent runtime events</p>
              </Card.Content>
            </Card>
            <Card className="border border-divider/50 bg-content2/40 shadow-none">
              <Card.Content className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Reading goal</p>
                <p className="text-sm font-medium text-foreground">Find spikes fast</p>
              </Card.Content>
            </Card>
          </div>
        </Card.Content>
      </Card>

      <div className="min-w-0">
        <ObservabilityPanel />
      </div>
    </div>
  );
}
