import { Card, Chip, Spinner } from '@heroui/react';
import { useBridgeStatusCard } from './use-bridge-status-card';

/** Card showing the live SQLite connection status of the bridge backend. */
export function BridgeStatusCard() {
  const { isLoading, sqliteStatus, statusTone } = useBridgeStatusCard();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Bridge Status</Card.Title>
        <Card.Description>Local service health</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">SQLite</span>
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <Chip color={statusTone} size="sm" variant="soft">
              <Chip.Label id="sqlite-status">{sqliteStatus}</Chip.Label>
            </Chip>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
