import { Typography } from '@heroui/react';
import { NetworkPanel } from '../../features/network/ui/NetworkPanel/NetworkPanel';

export function NetworkRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1" weight="semibold">
          Network
        </Typography>
        <Typography color="muted" type="body-sm">
          Request and operation activity captured by the bridge
        </Typography>
      </header>
      <div className="min-w-0">
        <NetworkPanel />
      </div>
    </div>
  );
}
