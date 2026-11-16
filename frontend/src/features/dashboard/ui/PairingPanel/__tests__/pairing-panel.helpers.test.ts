import { describe, expect, it, vi } from 'vitest';

/** Hoisted because vi.mock is lifted above this declaration, and the qrcode factory below has to close over the same spy. */
const { toDataURLMock } = vi.hoisted(() => ({
  toDataURLMock: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
}));

vi.mock('qrcode', () => ({
  toDataURL: toDataURLMock,
}));

import { buildPairingQrImageUrl, buildPairingQrValue, parseEffectiveAddress, toPairingPanelReadings } from '../pairing-panel.helpers';

describe('parseEffectiveAddress', () => {
  it('splits ip and port from a valid address', () => {
    expect(parseEffectiveAddress('192.168.1.10:9876')).toEqual({
      ip: '192.168.1.10',
      port: '9876',
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
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '9876', token: 'token-123' })).toBe(
      'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123',
    );
  });

  it('returns an empty string when the address is incomplete', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '', token: 'token-123' })).toBe('');
  });

  it('returns an empty string when the token is missing', () => {
    expect(buildPairingQrValue({ ip: '192.168.1.10', port: '9876', token: '' })).toBe('');
  });
});

describe('buildPairingQrImageUrl', () => {
  it('uses the default qr rendering options when none are provided', async () => {
    const value = 'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123';

    await buildPairingQrImageUrl(value);

    expect(toDataURLMock).toHaveBeenLastCalledWith(value, { margin: 1, width: 160 });
  });

  it('returns a qr image data url', async () => {
    await expect(
      buildPairingQrImageUrl('autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123'),
    ).resolves.toBe(
      'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123',
    );
  });

  it('forwards caller-provided qr rendering options unchanged', async () => {
    const value = 'autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123';
    const options = { margin: 2, width: 220 };

    await buildPairingQrImageUrl(value, options);

    expect(toDataURLMock).toHaveBeenLastCalledWith(value, options);
  });
});

describe('toPairingPanelReadings', () => {
  /** A ready view of value. */
  const ready = (data: string, isRefreshing = false) => ({ kind: 'ready' as const, data, isRefreshing });

  it('shows both values once ready', () => {
    expect(toPairingPanelReadings({ address: ready('192.168.1.10:9876'), token: ready('token-123') })).toEqual({
      address: '192.168.1.10:9876',
      token: 'token-123',
      failureMessage: '',
    });
  });

  it('hides a token being re-read after it was consumed, and anything still loading', () => {
    expect(toPairingPanelReadings({ address: { kind: 'loading' }, token: ready('token-123', true) })).toEqual({ address: '', token: '', failureMessage: '' });
  });

  it.each([
    ['address', { address: { kind: 'failure' as const, code: 'failed_precondition' as const, message: 'api: bind failed' }, token: ready('token-123') }, 'api: bind failed'],
    ['token', { address: ready('192.168.1.10:9876'), token: { kind: 'failure' as const, code: 'internal' as const, message: 'token lookup failed' } }, 'token lookup failed'],
  ])('reports the %s failure', (_read, views, message) => {
    expect(toPairingPanelReadings(views).failureMessage).toBe(message);
  });
});
