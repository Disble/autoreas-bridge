import { Button, Card, Chip } from '@heroui/react';
import { usePairingPanel } from './use-pairing-panel';

/** Panel rendering the pairing token, address, and QR code for mobile clients. */
export function PairingPanel() {
  const { copied, ip, onCopyToken, port, qrImageUrl, token } = usePairingPanel();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Pair a Device</Card.Title>
        <Card.Description>Scan the QR code from Autoreas Mobile, or use the token below as a manual fallback</Card.Description>
      </Card.Header>
      {/*
       * Wide-screen layout: pairing info (LAN + token) fills the flexible left
       * column while the QR pins right, instead of a centered QR with empty
       * flanks. Collapses to a single stacked column below `lg`.
       */}
      <Card.Content className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">LAN</span>
            <Chip color="default" size="sm" variant="secondary">
              <Chip.Label id="lan-ip">{ip ? `${ip}:${port}` : '—'}</Chip.Label>
            </Chip>
          </div>

          <div className="flex items-center gap-2">
            <code id="pairing-token" className="min-w-0 flex-1 truncate rounded-lg bg-surface-secondary px-3 py-2 text-sm text-foreground">
              {token || '—'}
            </code>
            <Button
              isDisabled={!token}
              onPress={() => {
                onCopyToken().catch(() => undefined);
              }}
              size="sm"
              variant={copied ? 'secondary' : 'outline'}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {qrImageUrl ? (
          <div className="flex justify-center lg:justify-end">
            <div className="rounded-xl bg-white p-3">
              <img alt="Pairing QR" className="size-40 lg:size-48" id="pairing-qr" src={qrImageUrl} />
            </div>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
