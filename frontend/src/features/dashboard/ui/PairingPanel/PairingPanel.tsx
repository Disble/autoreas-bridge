import { Button, Card, Chip } from '@heroui/react';
import { usePairingPanel } from './use-pairing-panel';

export function PairingPanel() {
  const { copied, ip, onCopyToken, port, qrImageUrl, token } = usePairingPanel();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Pair a Device</Card.Title>
        <Card.Description>Scan the QR code from Autoreas Mobile or enter the token manually</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">LAN</span>
          <Chip color="default" size="sm" variant="secondary">
            <Chip.Label id="lan-ip">{ip ? `${ip}:${port}` : '—'}</Chip.Label>
          </Chip>
        </div>

        {qrImageUrl ? (
          <div className="flex justify-center">
            <div className="rounded-xl bg-white p-3">
              <img alt="Pairing QR" className="size-40" id="pairing-qr" src={qrImageUrl} />
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <code id="pairing-token" className="flex-1 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-foreground">
            {token || '—'}
          </code>
          <Button isDisabled={!token} onPress={onCopyToken} size="sm" variant={copied ? 'secondary' : 'outline'}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
