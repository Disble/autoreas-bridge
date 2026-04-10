import { Card } from '@heroui/react';
import { PairingPanel } from '../../features/dashboard/ui/PairingPanel';

export function PairingRoute() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
      <div className="min-w-0">
        <Card className="h-full">
          <Card.Header>
            <Card.Title>Device pairing</Card.Title>
            <Card.Description>Use the wider layout to scan, confirm LAN reachability, and copy credentials with less visual crowding.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-3 text-sm text-muted">
            <p>Fullscreen works best when the QR code and token flow have room to breathe. This panel reserves context on the left while the pairing workflow stays prominent on the right.</p>
            <p>As the product grows, this area can host pairing instructions, recent devices, or troubleshooting steps without collapsing the main action space.</p>
          </Card.Content>
        </Card>
      </div>

      <div className="min-w-0">
        <PairingPanel />
      </div>
    </div>
  );
}
