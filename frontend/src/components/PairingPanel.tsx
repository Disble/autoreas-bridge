import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { GetEffectiveAddress, GetPairingToken } from '../../wailsjs/go/main/App';

export function PairingPanel() {
    const [address, setAddress] = useState('');
    const [token, setToken] = useState('…');
    const [copied, setCopied] = useState(false);

    const ip = address ? address.split(':')[0] : '';
    const port = address ? address.split(':')[1] : '';
    const qrValue = ip && port ? `http://${ip}:${port}` : '';

    useEffect(() => {
        GetEffectiveAddress().then(setAddress);
        GetPairingToken().then(setToken);
    }, []);

    function copyToken() {
        if (!token || token === '…') return;
        navigator.clipboard.writeText(token).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <section>
            <h2>Pair a Device</h2>
            <div>
                <strong>LAN IP:</strong>{' '}
                <span id="lan-ip">{ip || '—'}</span>
                {port && <span> :{port}</span>}
            </div>
            {qrValue && (
                <div style={{ margin: '1rem auto', display: 'inline-block', background: 'white', padding: '0.5rem' }}>
                    <QRCode value={qrValue} size={160} id="pairing-qr" />
                </div>
            )}
            <div>
                <strong>Token:</strong>{' '}
                <span id="pairing-token" style={{ fontFamily: 'monospace' }}>{token}</span>
                {' '}
                <button type="button" onClick={copyToken}>
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
        </section>
    );
}
