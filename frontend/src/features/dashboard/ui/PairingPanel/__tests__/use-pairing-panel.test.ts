import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getEffectiveAddressMock = vi.fn();
const getPairingTokenMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock('../../../dashboard.bindings', () => ({
  getEffectiveAddress: () => getEffectiveAddressMock(),
  getPairingToken: () => getPairingTokenMock(),
}));

import { usePairingPanel } from '../use-pairing-panel';

describe('usePairingPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
    getEffectiveAddressMock.mockReset();
    getPairingTokenMock.mockReset();
    writeTextMock.mockReset();
  });

  it('loads pairing data on mount', async () => {
    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock.mockResolvedValueOnce('token-123');

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    expect(result.current.ip).toBe('192.168.1.10');
    expect(result.current.port).toBe('8080');
    expect(result.current.qrValue).toBe('http://192.168.1.10:8080');
  });

  it('copies the token and clears feedback after the timeout', async () => {
    vi.useFakeTimers();
    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock.mockResolvedValueOnce('token-123');
    writeTextMock.mockResolvedValueOnce(undefined);

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.token).toBe('token-123');

    await act(async () => {
      await result.current.onCopyToken();
    });

    expect(writeTextMock).toHaveBeenCalledWith('token-123');
    expect(result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });
});
