import { toDataURL } from 'qrcode';
import type { PairingQrImageOptions, PairingQrPayloadInput, ParsedEffectiveAddress } from './pairing-panel.types';

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
 * The mobile app expects the canonical versioned deep link only when IP, port, and token are present.
 */
export function buildPairingQrValue(payload: PairingQrPayloadInput) {
  if (!payload.ip || !payload.port || !payload.token) {
    return '';
  }

  const searchParams = new URLSearchParams({
    v: '1',
    ip: payload.ip,
    port: payload.port,
    token: payload.token,
  });

  return `autoreas-mobile://pair?${searchParams.toString()}`;
}

/**
 * Generates a QR image data URL that is safe to render in Wails desktop using a plain `<img>`.
 * This avoids the WebView-specific rendering issues we hit with `react-qr-code`.
 */
export function buildPairingQrImageUrl(value: string, options: PairingQrImageOptions = DEFAULT_PAIRING_QR_OPTIONS) {
  return toDataURL(value, options);
}
