import { describe, expect, it, vi } from 'vitest';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
  },
}));

import { buildPairingQrImageUrl, buildPairingQrValue, parseEffectiveAddress } from '../pairing-panel.helpers';

describe('parseEffectiveAddress', () => {
  it('splits ip and port from a valid address', () => {
    expect(parseEffectiveAddress('192.168.1.10:8080')).toEqual({
      ip: '192.168.1.10',
      port: '8080',
    });
  });

  it('returns empty parts for an invalid address', () => {
    expect(parseEffectiveAddress('')).toEqual({
      ip: '',
      port: '',
    });
  });
});

describe('buildPairingQrValue', () => {
  it('builds the http url when ip and port exist', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '8080' })).toBe('http://192.168.1.10:8080');
  });

  it('returns an empty string when the address is incomplete', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '' })).toBe('');
  });
});

describe('buildPairingQrImageUrl', () => {
  it('returns a qr image data url', async () => {
    await expect(buildPairingQrImageUrl('http://192.168.1.10:8080')).resolves.toBe(
      'data:image/png;base64,http://192.168.1.10:8080',
    );
  });
});
