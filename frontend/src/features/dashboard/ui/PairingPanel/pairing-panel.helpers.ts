import { toDataURL } from 'qrcode';
import { DEFAULT_PAIRING_QR_OPTIONS } from './pairing-panel.constants';
import type { PairingPanelReadings, PairingPanelViews, PairingQrImageOptions, PairingQrPayloadInput, ParsedEffectiveAddress } from './pairing-panel.types';

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

/**
 * What the panel shows from its two reads (ADR-032 §4): each value once ready,
 * nothing while it loads, and the first failure's message. A token being
 * re-read after a device consumed it shows nothing, so a spent token is never
 * offered for pairing.
 * @param views The address and token views.
 * @returns The address, the token and the failure message.
 */
export function toPairingPanelReadings(views: PairingPanelViews): PairingPanelReadings {
  const { address, token } = views;
  const failure = [address, token].find((view) => view.kind === 'failure');

  return {
    address: address.kind === 'ready' ? address.data : '',
    token: token.kind === 'ready' && !token.isRefreshing ? token.data : '',
    failureMessage: failure?.kind === 'failure' ? failure.message : '',
  };
}
