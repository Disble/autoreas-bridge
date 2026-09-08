import { Card, Chip, Skeleton } from '@heroui/react';
import { BRIDGE_STATUS_LOADING_LABEL, BRIDGE_STATUS_PLACEHOLDER_CLASS } from './bridge-status-card.constants';
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
            <div aria-labelledby="bridge-status-loading-label" aria-live="polite" role="status">
              <span className="sr-only" id="bridge-status-loading-label">
                {BRIDGE_STATUS_LOADING_LABEL}
              </span>
              <Skeleton className={BRIDGE_STATUS_PLACEHOLDER_CLASS} data-testid="bridge-status-skeleton" />
            </div>
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
