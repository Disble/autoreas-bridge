import { describe, expect, it } from 'vitest';
import { buildPairingQrValue, parseEffectiveAddress, resolvePairingQrCodeComponent } from '../pairing-panel.helpers';
import type { PairingQrCodeComponent } from '../pairing-panel.types';

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

describe('resolvePairingQrCodeComponent', () => {
  it('returns the direct function export when the module is callable', () => {
    const directComponent: PairingQrCodeComponent = function DirectComponent() {
      return null;
    };

    expect(resolvePairingQrCodeComponent(directComponent)).toBe(directComponent);
  });

  it('returns the default export when the module exposes it that way', () => {
    const defaultComponent: PairingQrCodeComponent = function DefaultComponent() {
      return null;
    };

    expect(resolvePairingQrCodeComponent({ default: defaultComponent })).toBe(defaultComponent);
  });

  it('returns the nested QRCode export when the module exposes it that way', () => {
    const nestedComponent: PairingQrCodeComponent = function NestedComponent() {
      return null;
    };

    expect(resolvePairingQrCodeComponent({ QRCode: nestedComponent })).toBe(nestedComponent);
  });

  it('throws when no supported export exists', () => {
    expect(() => resolvePairingQrCodeComponent({})).toThrow('react-qr-code export shape is unsupported');
  });
});
