import { describe, expect, it } from 'vitest';
import { formatLastSync, toConnectedDeviceRows } from '../connected-devices-panel.helpers';

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
