import QRCode from 'qrcode';
import type { ParsedEffectiveAddress, PairingQrImageOptions } from './pairing-panel.types';

export const DEFAULT_PAIRING_QR_OPTIONS: PairingQrImageOptions = {
  margin: 1,
  width: 160,
};

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
 * Generates a QR image data URL that is safe to render in Wails desktop using a plain `<img>`.
 * This avoids the WebView-specific rendering issues we hit with `react-qr-code`.
 */
export function buildPairingQrImageUrl(value: string, options: PairingQrImageOptions = DEFAULT_PAIRING_QR_OPTIONS) {
  return QRCode.toDataURL(value, options);
}
