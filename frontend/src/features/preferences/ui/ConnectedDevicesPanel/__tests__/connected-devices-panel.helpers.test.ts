import { describe, expect, it } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { formatLastSync, getConnectionStatusColor, toConnectedDeviceRows, toConnectedDevicesView, toVisibleUnpairFailure } from '../connected-devices-panel.helpers';

describe('toConnectedDeviceRows', () => {
  it('maps connected device DTOs to UI rows', () => {
    const rows = toConnectedDeviceRows([
      {
        auth_state: 'active',
        blocks_changelog_pruning: true,
        connection_status: 'disconnected',
        device_id: 'device-1',
        device_name: 'Galaxy Tab',
        last_ack_changelog_id: 42,
        last_seen_at_ms: 0,
        paired_at_ms: 100,
        sync_status: 'warning',
      },
    ]);

    expect(rows).toEqual([
      {
        authState: 'active',
        blocksPruning: true,
        connectionStatus: 'disconnected',
        id: 'device-1',
        lastSyncLabel: 'Never synced',
        name: 'Galaxy Tab',
        syncStatus: 'warning',
      },
    ]);
  });
});

describe('formatLastSync', () => {
  it('shows never synced when there is no last seen timestamp', () => {
    expect(formatLastSync(0)).toBe('Never synced');
  });
});

describe('getConnectionStatusColor', () => {
  it('colors a live websocket connection as success regardless of sync health', () => {
    expect(getConnectionStatusColor('connected', 'stale')).toBe('success');
  });

  it('colors a disconnected device with stale sync as warning', () => {
    expect(getConnectionStatusColor('disconnected', 'stale')).toBe('warning');
  });

  it('colors a disconnected device with healthy sync as the muted default', () => {
    expect(getConnectionStatusColor('disconnected', 'active')).toBe('default');
  });
});

describe('toVisibleUnpairFailure', () => {
  /** A rejected unpair submitted at 2000. */
  const rejected = { status: 'error' as const, error: createBridgeError('internal', 'disk I/O error'), submittedAt: 2000 };

  it('shows a rejected unpair submitted after the list last loaded, including at the same instant', () => {
    expect(toVisibleUnpairFailure(rejected, 1000)).toBe('disk I/O error');
    expect(toVisibleUnpairFailure(rejected, 2000)).toBe('disk I/O error');
  });

  it('hides it once the list loaded again, and shows nothing for an unpair that did not fail', () => {
    expect(toVisibleUnpairFailure(rejected, 2001)).toBe('');
    expect(toVisibleUnpairFailure({ status: 'success', error: null, submittedAt: 2000 }, 1000)).toBe('');
  });
});

describe('toConnectedDevicesView', () => {
  /** A settled device-list query with one device. */
  const query = {
    status: 'success' as const,
    data: [{ auth_state: 'active', blocks_changelog_pruning: false, connection_status: 'connected', device_id: 'device-1', device_name: 'Galaxy Tab', last_ack_changelog_id: 1, last_seen_at_ms: 0, paired_at_ms: 0, sync_status: 'active' }],
    error: null,
    isFetching: false,
  };

  it('maps ready devices to rows', () => {
    expect(toConnectedDevicesView(query, '')).toMatchObject({ kind: 'ready', isRefreshing: false, data: [{ id: 'device-1', name: 'Galaxy Tab' }] });
  });

  it('lets a visible unpair failure win over the rows', () => {
    expect(toConnectedDevicesView(query, 'disk I/O error')).toEqual({ kind: 'failure', code: 'internal', message: 'disk I/O error' });
  });

  it('keeps the loading and empty states as they are', () => {
    expect(toConnectedDevicesView({ ...query, status: 'pending', data: undefined }, '')).toEqual({ kind: 'loading' });
    expect(toConnectedDevicesView({ ...query, data: [] }, '')).toEqual({ kind: 'empty' });
  });
});
