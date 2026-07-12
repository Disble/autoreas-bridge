import type { PairingQrImageOptions } from './pairing-panel.types';

/**
 * Shares the default QR image dimensions across pairing helpers so callers get
 * a stable Wails-safe image size without duplicating magic numbers.
 */
export const DEFAULT_PAIRING_QR_OPTIONS: PairingQrImageOptions = {
  margin: 1,
  width: 160,
};
