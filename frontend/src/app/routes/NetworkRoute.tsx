import { Text } from '@heroui/react';
import { NetworkPanel } from '../../features/network/ui/NetworkPanel/NetworkPanel';

export function NetworkRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Text className="font-semibold" elementType="h1" size="xl">
          Network
        </Text>
        <Text size="sm" variant="muted">
          Request and operation activity captured by the bridge
        </Text>
      </header>
      <div className="min-w-0">
        <NetworkPanel />
      </div>
    </div>
  );
}
