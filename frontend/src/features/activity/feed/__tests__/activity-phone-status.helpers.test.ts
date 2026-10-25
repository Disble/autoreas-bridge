import { describe, expect, it } from 'vitest';
import { toPhoneStatus } from '../activity-phone-status.helpers';

/** The current time of every case, epoch milliseconds. */
const NOW_MS = Date.UTC(2026, 9, 23, 12, 0);

/** One minute, epoch milliseconds. */
const MINUTE_MS = 60_000;

describe('toPhoneStatus', () => {
  it.each([
    ['a connected phone reads connected with its last sync', [{ connection_status: 'connected', last_seen_at_ms: NOW_MS - 5 * MINUTE_MS }], { isConnected: true, label: 'Phone connected · last sync 5m ago' }],
    ['a phone that is not connected reads offline', [{ connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 120 * MINUTE_MS }], { isConnected: false, label: 'Phone offline · last sync 2h ago' }],
    [
      'the newest last contact wins across phones, and any connected phone reads connected',
      [
        { connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 10 * MINUTE_MS },
        { connection_status: 'connected', last_seen_at_ms: NOW_MS - 3 * MINUTE_MS },
        { connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 60 * MINUTE_MS },
      ],
      { isConnected: true, label: 'Phone connected · last sync 3m ago' },
    ],
    ['a phone without a websocket that synced 1:59 ago reads connected', [{ connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 119_000 }], { isConnected: true, label: 'Phone connected · last sync 1m ago' }],
    ['a phone without a websocket that synced 2:01 ago reads offline', [{ connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 121_000 }], { isConnected: false, label: 'Phone offline · last sync 2m ago' }],
  ])('%s', (_case, devices, expected) => {
    expect(toPhoneStatus(devices, NOW_MS)).toEqual(expected);
  });

  it.each([
    ['no phone is paired', []],
    ['the newest last contact is 0', [{ connection_status: 'connected', last_seen_at_ms: 0 }]],
  ])('hides the line when %s', (_case, devices) => {
    expect(toPhoneStatus(devices, NOW_MS)).toBeUndefined();
  });
});
