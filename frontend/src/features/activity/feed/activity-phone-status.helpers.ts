import { formatRelativeTimeAgo } from '../../../shared/datetime/datetime.helpers';
import type { ActivityPhoneDevice, ActivityPhoneStatusModel } from './activity-feed.types';

/**
 * The phone status line (S13): "Phone connected" when any paired phone is
 * connected, else "Phone offline", then "· last sync" with the newest last
 * contact. Undefined, which hides the line, when no phone is paired or the
 * newest last contact is 0.
 *
 * @param devices The paired devices.
 * @param nowMs The current time, epoch milliseconds.
 * @returns The line, or undefined to hide it.
 */
export function toPhoneStatus(devices: readonly ActivityPhoneDevice[], nowMs: number): ActivityPhoneStatusModel | undefined {
  const lastSeenMs = Math.max(0, ...devices.map((device) => device.last_seen_at_ms));
  if (lastSeenMs === 0) {
    return undefined;
  }
  const isConnected = devices.some((device) => device.connection_status === 'connected');
  return { isConnected, label: `${isConnected ? 'Phone connected' : 'Phone offline'} · last sync ${formatRelativeTimeAgo(lastSeenMs, nowMs)}` };
}
