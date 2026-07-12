import { describe, expect, it, vi } from 'vitest';

const { toDataURLMock } = vi.hoisted(() => ({
  toDataURLMock: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
}));

vi.mock('qrcode', () => ({
  toDataURL: toDataURLMock,
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
  it('builds the canonical pairing deep link when ip, port, and token exist', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '8080', token: 'token-123' })).toBe(
      'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123',
    );
  });

  it('returns an empty string when the address is incomplete', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '', token: 'token-123' })).toBe('');
  });

  it('returns an empty string when the token is missing', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '8080', token: '' })).toBe('');
  });
});

describe('buildPairingQrImageUrl', () => {
  it('uses the default qr rendering options when none are provided', async () => {
    const value = 'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123';

    await buildPairingQrImageUrl(value);

    expect(toDataURLMock).toHaveBeenLastCalledWith(value, { margin: 1, width: 160 });
  });

  it('returns a qr image data url', async () => {
    await expect(
      buildPairingQrImageUrl('autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123'),
    ).resolves.toBe(
      'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123',
    );
  });

  it('forwards caller-provided qr rendering options unchanged', async () => {
    const value = 'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123';
    const options = { margin: 2, width: 220 };

    await buildPairingQrImageUrl(value, options);

    expect(toDataURLMock).toHaveBeenLastCalledWith(value, options);
  });
});
