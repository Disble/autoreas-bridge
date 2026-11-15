import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevicesSource } from '../../../../../shared/contracts/devices.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { usePairingPanel } from '../use-pairing-panel';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${value}`),
}));

/** The pairing reads' port; every read resolves empty unless a test overrides it. */
type PairingSource = Pick<DevicesSource, 'getEffectiveAddress' | 'getPairingToken'>;

/** Builds a pairing-source double whose reads resolve empty, so each test overrides only the call it is about. */
function createFakeSource(overrides: Partial<PairingSource> = {}): PairingSource {
  return {
    getEffectiveAddress: vi.fn().mockResolvedValue(''),
    getPairingToken: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

/**
 * Renders the hook under a query wrapper whose `api` and `devices` modules report the given states,
 * with the app's invalidation rules connected to a fake event source.
 * @param source The pairing reads.
 * @param modules The modules' readiness; both ready by default.
 * @returns The hook render, the readiness `emit` and the backend event `fire`.
 */
function renderPairing(source: PairingSource, modules: readonly ModuleReadiness[] = [status('api', 'ready'), status('devices', 'ready')]) {
  const { client, wrapper, emit } = createModulesTestWrapper(...modules);
  const events = connectBridgeEvents(client);
  return { ...renderHook(() => usePairingPanel(source), { wrapper }), emit, fire: events.emit };
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

    const { result } = renderPairing(source);

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

    const { result } = renderPairing(source);

    await waitFor(() => {
      expect(result.current.ip).toBe('192.168.1.10');
      expect(result.current.port).toBe('9876');
      expect(result.current.token).toBe('');
    });

    expect(result.current.qrImageUrl).toBe('');
  });

  it('re-reads the pairing token when the backend reports it consumed', async () => {
    const getPairingTokenMock = vi.fn().mockResolvedValueOnce('token-123').mockResolvedValueOnce('token-456');
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: getPairingTokenMock,
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result, fire } = renderPairing(source);

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    await act(async () => {
      fire('pairing.token-consumed');
    });

    await waitFor(() => {
      expect(result.current.token).toBe('token-456');
    });

    expect(getPairingTokenMock).toHaveBeenCalledTimes(2);
  });

  it('clears the stale token while a consumed token refresh is in flight', async () => {
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
    });

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const { result, fire } = renderPairing(source);

    await waitFor(() => {
      expect(result.current.token).toBe('token-123');
    });

    await act(async () => {
      fire('pairing.token-consumed');
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

    const { result } = renderPairing(source);

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

  it('shows nothing, and does not read, while the modules start; then the token once ready', async () => {
    const source = createFakeSource({
      getEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      getPairingToken: vi.fn().mockResolvedValue('token-123'),
    });
    const { result, emit } = renderPairing(source, [status('api', 'starting'), status('devices', 'starting')]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current).toMatchObject({ token: '', ip: '', failureMessage: '', qrImageUrl: '' });
    expect(source.getPairingToken).not.toHaveBeenCalled();

    act(() => {
      emit(status('api', 'ready'));
      emit(status('devices', 'ready'));
    });

    await waitFor(() => expect(result.current).toMatchObject({ token: 'token-123', ip: '192.168.1.10' }));
  });

  it.each([
    ['the devices module failed', [status('api', 'ready'), status('devices', 'failed', 'devices: database locked')], createFakeSource(), 'devices: database locked'],
    [
      'the address read rejects',
      [status('api', 'ready'), status('devices', 'ready')],
      createFakeSource({ getEffectiveAddress: vi.fn().mockRejectedValue(createBridgeError('internal', 'no listener')) }),
      'no listener',
    ],
  ])('reports the failure and offers no token when %s', async (_case, modules, source, message) => {
    const { result } = renderPairing(source, modules);

    await waitFor(() => expect(result.current.failureMessage).toBe(message));
    expect(result.current.qrImageUrl).toBe('');
  });
});
