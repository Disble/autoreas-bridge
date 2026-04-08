import { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import QRCodeLib from 'react-qr-code';
const QRCode = typeof QRCodeLib === 'function' ? QRCodeLib : (QRCodeLib as any).QRCode;
import { Card, Button, Chip } from '@heroui/react';
import { GetEffectiveAddress, GetPairingToken } from '../../wailsjs/go/main/App';

export function PairingPanel() {
    const [address, setAddress] = useState('');
    const [token, setToken] = useState('');
    const [copied, setCopied] = useState(false);

    const ip = address ? address.split(':')[0] : '';
    const port = address ? address.split(':')[1] : '';
    const qrValue = ip && port ? `http://${ip}:${port}` : '';

    useEffect(() => {
        GetEffectiveAddress().then(setAddress);
        GetPairingToken().then(setToken);
    }, []);

    function copyToken() {
        if (!token) return;
        navigator.clipboard.writeText(token).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <Card>
            <Card.Header>
                <Card.Title>Pair a Device</Card.Title>
                <Card.Description>
                    Scan the QR code from Autoreas Mobile or enter the token manually
                </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col gap-4">
                {/* Network info */}
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">LAN</span>
                    <Chip variant="secondary" size="sm" color="default">
                        <Chip.Label id="lan-ip">
                            {ip ? `${ip}:${port}` : '—'}
                        </Chip.Label>
                    </Chip>
                </div>

                {/* QR Code */}
                {qrValue && (
                    <div className="flex justify-center">
                        <div className="rounded-xl bg-white p-3">
                            <QRCode value={qrValue} size={160} id="pairing-qr" />
                        </div>
                    </div>
                )}

                {/* Token */}
                <div className="flex items-center gap-2">
                    <code
                        id="pairing-token"
                        className="flex-1 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-foreground"
                    >
                        {token || '—'}
                    </code>
                    <Button
                        variant={copied ? 'secondary' : 'outline'}
                        size="sm"
                        onPress={copyToken}
                        isDisabled={!token}
                    >
                        {copied ? 'Copied!' : 'Copy'}
                    </Button>
                </div>
            </Card.Content>
        </Card>
    );
}
