import { describe, expect, it, vi } from 'vitest';

import type { DevicesSource } from '../../../shared/contracts/devices.types';
import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One paired device as `GetConnectedDevices` answers it. */
const TABLET = {
  device_id: 'device-1',
  device_name: 'Galaxy Tab',
  paired_at_ms: 100,
  last_seen_at_ms: 200,
  last_ack_changelog_id: 42,
  sync_status: 'active',
  connection_status: 'connected',
  auth_state: 'active',
  blocks_changelog_pruning: false,
};

/** One pending anime sync as `GetSyncingAnimeItems` answers it. */
const PENDING = { animeId: 'anime-9', title: 'Frieren', changeType: 'update', pendingChanges: 1, changedFields: ['nrocapvisto'], lastChangedAtMs: 1, active: 1 };

/** Every Devices binding, as `window.go.desktop.App` exposes it, mapped to its source call. */
const CALLS: ReadonlyArray<readonly [binding: string, call: (source: DevicesSource) => Promise<unknown>]> = [
  ['GetEffectiveAddress', (source) => source.getEffectiveAddress()],
  ['GetPairingToken', (source) => source.getPairingToken()],
  ['GetConnectedDevices', (source) => source.getConnectedDevices()],
  ['UnpairDevice', (source) => source.unpairDevice('device-1')],
  ['GetSyncingAnimeItems', (source) => source.getSyncingAnimeItems()],
  ['TriggerReconcile', (source) => source.triggerReconcile()],
];

/** Attaches Devices bindings to a fake Wails `window.go`. */
function attachBindings(bindings: Readonly<Record<string, unknown>>) {
  window.go = { desktop: { App: bindings } } as never;
}

describe('createDevicesSource', () => {
  useIsolatedWailsRuntime();

  it('answers what each binding answers, passing the device id through, once the bindings attach', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const { createDevicesSource } = await import('../devices-source.helpers');
    const unpairDevice = vi.fn().mockResolvedValue(undefined);
    const triggerReconcile = vi.fn().mockResolvedValue(undefined);
    const source = createDevicesSource();

    const address = source.getEffectiveAddress();
    attachBindings({
      GetEffectiveAddress: vi.fn().mockResolvedValue('192.168.1.10:9876'),
      GetPairingToken: vi.fn().mockResolvedValue('token-123'),
      GetConnectedDevices: vi.fn().mockResolvedValue([TABLET]),
      UnpairDevice: unpairDevice,
      GetSyncingAnimeItems: vi.fn().mockResolvedValue([PENDING]),
      TriggerReconcile: triggerReconcile,
    });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(address).resolves.toBe('192.168.1.10:9876');
    await expect(source.getPairingToken()).resolves.toBe('token-123');
    await expect(source.getConnectedDevices()).resolves.toEqual([TABLET]);
    await expect(source.unpairDevice('device-1')).resolves.toBeUndefined();
    await expect(source.getSyncingAnimeItems()).resolves.toEqual([PENDING]);
    await expect(source.triggerReconcile()).resolves.toBeUndefined();
    expect(unpairDevice).toHaveBeenCalledExactlyOnceWith('device-1');
    expect(triggerReconcile).toHaveBeenCalledOnce();
  });

  it.each([
    ['the module is starting', '{"code":"unavailable","message":"devices is starting"}', { code: 'unavailable', message: 'devices is starting' }],
    ['the module failed', '{"code":"failed_precondition","message":"devices: db closed"}', { code: 'failed_precondition', message: 'devices: db closed' }],
    ['a plain rejection', 'boom', { code: 'internal', message: 'boom' }],
  ])('rejects every call with a BridgeError when %s, never with a fallback', async (_label, rejection, expected) => {
    const { createDevicesSource } = await import('../devices-source.helpers');
    attachBindings(Object.fromEntries(CALLS.map(([binding]) => [binding, vi.fn().mockRejectedValue(new Error(rejection))])));
    const source = createDevicesSource();

    for (const [, call] of CALLS) {
      await expect(call(source)).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    }
  });

  it('rejects every call as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const { createDevicesSource } = await import('../devices-source.helpers');
    const source = createDevicesSource();

    const rejections = CALLS.map(([, call]) =>
      expect(call(source)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(rejections);
  });
});
