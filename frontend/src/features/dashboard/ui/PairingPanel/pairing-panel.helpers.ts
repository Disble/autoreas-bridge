import QRCodeLib from 'react-qr-code';
import type { ParsedEffectiveAddress } from './pairing-panel.types';
import type { PairingQrCodeComponent, PairingQrCodeModule } from './pairing-panel.types';

/**
 * Splits the effective Wails address into IP and port segments.
 * This keeps string parsing deterministic and reusable for tests.
 */
export function parseEffectiveAddress(address: string): ParsedEffectiveAddress {
  const [ip = '', port = ''] = address.split(':');

  return {
    ip,
    port,
  };
}

/**
 * Builds the QR payload for device pairing.
 * The mobile app expects a raw HTTP URL only when both IP and port are present.
 */
export function buildPairingQrValue(address: ParsedEffectiveAddress) {
  return address.ip && address.port ? `http://${address.ip}:${address.port}` : '';
}

/**
 * Resolves the `react-qr-code` export shape so the desktop WebView can use either
 * the direct callable export or the nested `QRCode` export exposed by the bundler interop layer.
 */
export function resolvePairingQrCodeComponent(
  qrCodeModule: PairingQrCodeComponent | PairingQrCodeModule,
): PairingQrCodeComponent {
  if (typeof qrCodeModule === 'function') {
    return qrCodeModule;
  }

  if (typeof qrCodeModule.default === 'function') {
    return qrCodeModule.default;
  }

  if (typeof qrCodeModule.QRCode === 'function') {
    return qrCodeModule.QRCode;
  }

  throw new Error('react-qr-code export shape is unsupported');
}

export const PairingQrCode = resolvePairingQrCodeComponent(
  QRCodeLib as unknown as PairingQrCodeComponent | PairingQrCodeModule,
);
