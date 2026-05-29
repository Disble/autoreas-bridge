import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAIRING_TOKEN_CONSUMED_EVENT_NAME } from '../pairing-panel.constants';

const getEffectiveAddressMock = vi.fn();
const getPairingTokenMock = vi.fn();
const subscribeToEventMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
  },
}));

vi.mock('../../../dashboard.bindings', () => ({
  getEffectiveAddress: () => getEffectiveAddressMock(),
  getPairingToken: () => getPairingTokenMock(),
  subscribeToEvent: (...args: unknown[]) => subscribeToEventMock(...args),
}));

import { usePairingPanel } from '../use-pairing-panel';

describe('usePairingPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
    getEffectiveAddressMock.mockReset();
    getPairingTokenMock.mockReset();
    subscribeToEventMock.mockReset();
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
      expect(result.current.qrImageUrl).toBe(
        'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123',
      );
    });

    expect(result.current.token).toBe('token-123');
    expect(result.current.ip).toBe('192.168.1.10');
    expect(result.current.port).toBe('8080');
    expect(result.current.qrImageUrl).toBe(
      'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123',
    );
  });

  it('does not expose a qr image until both address and token exist', async () => {
    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock.mockResolvedValueOnce('');

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.ip).toBe('192.168.1.10');
      expect(result.current.port).toBe('8080');
      expect(result.current.token).toBe('');
    });

    expect(result.current.qrImageUrl).toBe('');
  });

  it('refreshes the pairing token after the consumed event arrives', async () => {
    let onPairingTokenConsumed: (() => void) | undefined;

    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock.mockResolvedValueOnce('token-123').mockResolvedValueOnce('token-456');
    subscribeToEventMock.mockImplementation((eventName: string, callback: () => void) => {
      if (eventName === PAIRING_TOKEN_CONSUMED_EVENT_NAME) {
        onPairingTokenConsumed = callback;
      }

      return () => undefined;
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
      expect(result.current.qrImageUrl).toBe(
        'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-123',
      );
    });

    expect(subscribeToEventMock).toHaveBeenCalledWith(PAIRING_TOKEN_CONSUMED_EVENT_NAME, expect.any(Function));
    expect(onPairingTokenConsumed).toBeTypeOf('function');

    await act(async () => {
      onPairingTokenConsumed?.();
    });

    await waitFor(() => {
      expect(result.current.token).toBe('token-456');
      expect(result.current.qrImageUrl).toBe(
        'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=token-456',
      );
    });

    expect(getPairingTokenMock).toHaveBeenCalledTimes(2);
  });

  it('clears the stale token while a consumed token refresh is in flight', async () => {
    let onPairingTokenConsumed: (() => void) | undefined;
    let resolveNextToken: ((value: string) => void) | undefined;

    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock
      .mockResolvedValueOnce('token-123')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveNextToken = resolve;
          }),
      );
    subscribeToEventMock.mockImplementation((eventName: string, callback: () => void) => {
      if (eventName === PAIRING_TOKEN_CONSUMED_EVENT_NAME) {
        onPairingTokenConsumed = callback;
      }

      return () => undefined;
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    await act(async () => {
      onPairingTokenConsumed?.();
    });

    await waitFor(() => {
      expect(result.current.token).toBe('');
      expect(result.current.qrImageUrl).toBe('');
    });

    await act(async () => {
      resolveNextToken?.('token-456');
    });

    await waitFor(() => {
      expect(result.current.token).toBe('token-456');
    });
  });

  it('copies the token and clears feedback after the timeout', async () => {
    getEffectiveAddressMock.mockResolvedValueOnce('192.168.1.10:8080');
    getPairingTokenMock.mockResolvedValueOnce('token-123');
    writeTextMock.mockResolvedValueOnce(undefined);

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    vi.useFakeTimers();

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
