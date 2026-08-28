import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { usePairingPanel } from '../use-pairing-panel';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
}));

/** Builds a BridgeRuntimeSource double whose members all resolve empty, so each test overrides only the call it is about. */
function createFakeSource(overrides: Partial<BridgeRuntimeSource> = {}): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn().mockResolvedValue('ok'),
    getEffectiveAddress: vi.fn().mockResolvedValue(''),
    getPairingToken: vi.fn().mockResolvedValue(''),
    getSyncingAnimeItems: vi.fn().mockResolvedValue([]),
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    getAnimeHistory: vi.fn().mockResolvedValue([]),
    triggerReconcile: vi.fn().mockResolvedValue(''),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('usePairingPanel', () => {
  const writeTextMock = vi.fn();

  afterEach(() => {
    vi.useRealTimers();
    writeTextMock.mockReset();
  });

  it('loads pairing data on mount via the injected source', async () => {
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: vi.fn().mockResolvedValue('token-123'),
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel(source));

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
      expect(result.current.qrImageUrl).toBe(
        'data:image/png;base64,autoreas-mobile://pair?v=1&ip=192.168.1.10&port=9876&token=token-123',
      );
    });

    expect(result.current.ip).toBe('192.168.1.10');
    expect(result.current.port).toBe('9876');
  });

  it('does not expose a qr image until both address and token exist', async () => {
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: vi.fn().mockResolvedValue(''),
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel(source));

    await waitFor(() => {
      expect(result.current.ip).toBe('192.168.1.10');
      expect(result.current.port).toBe('9876');
      expect(result.current.token).toBe('');
    });

    expect(result.current.qrImageUrl).toBe('');
  });

  it('refreshes the pairing token after onPairingTokenConsumed fires', async () => {
    let onPairingTokenConsumed: (() => void) | undefined;
    const getPairingTokenMock = vi.fn().mockResolvedValueOnce('token-123').mockResolvedValueOnce('token-456');
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: getPairingTokenMock,
      onPairingTokenConsumed: vi.fn().mockImplementation((listener: () => void) => {
        onPairingTokenConsumed = listener;
        return () => undefined;
      }),
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel(source));

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    expect(source.onPairingTokenConsumed).toHaveBeenCalledWith(expect.any(Function));
    expect(onPairingTokenConsumed).toBeTypeOf('function');

    await act(async () => {
      onPairingTokenConsumed?.();
    });

    await waitFor(() => {
      expect(result.current.token).toBe('token-456');
    });

    expect(getPairingTokenMock).toHaveBeenCalledTimes(2);
  });

  it('clears the stale token while a consumed token refresh is in flight', async () => {
    let onPairingTokenConsumed: (() => void) | undefined;
    let resolveNextToken: ((value: string) => void) | undefined;
    const getPairingTokenMock = vi
      .fn()
      .mockResolvedValueOnce('token-123')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveNextToken = resolve;
          }),
      );
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: getPairingTokenMock,
      onPairingTokenConsumed: vi.fn().mockImplementation((listener: () => void) => {
        onPairingTokenConsumed = listener;
        return () => undefined;
      }),
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel(source));

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
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: vi.fn().mockResolvedValue('token-123'),
    });
    writeTextMock.mockResolvedValueOnce(undefined);

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel(source));

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

  it('uses the default singleton source when no source is injected', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result } = renderHook(() => usePairingPanel());

    await waitFor(() => {
      expect(result.current.token).toBe('');
    });
  });
});
