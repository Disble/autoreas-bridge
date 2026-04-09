import { describe, expect, it } from 'vitest';
import { buildPairingQrValue, parseEffectiveAddress } from '../pairing-panel.helpers';

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
