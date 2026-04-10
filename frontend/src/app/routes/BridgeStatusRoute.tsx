import { Card } from '@heroui/react';
import { BridgeStatusCard } from '../../features/dashboard/ui/BridgeStatusCard';

export function BridgeStatusRoute() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="min-w-0">
        <Card>
          <Card.Header>
            <Card.Title>Bridge status</Card.Title>
            <Card.Description>Service health and runtime readiness for the local desktop bridge.</Card.Description>
          </Card.Header>
          <Card.Content className="text-sm text-muted">
            Review the core bridge health signal first, then use the adjacent space for future runtime diagnostics and transport checks.
          </Card.Content>
        </Card>
      </div>

      <div className="min-w-0">
        <BridgeStatusCard />
      </div>
    </div>
  );
}
