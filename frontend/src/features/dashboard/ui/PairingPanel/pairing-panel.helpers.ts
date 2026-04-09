import type { ParsedEffectiveAddress } from './pairing-panel.types';

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
