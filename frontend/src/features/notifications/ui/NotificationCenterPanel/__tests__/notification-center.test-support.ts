import { vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../shared/contracts/notification-center.types';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';

/**
 * Fixtures shared by the notification-center suites, so every hook and panel
 * suite renders under the same query client and readiness gate.
 */

/**
 * Builds the render options for a notification-center hook or component: a
 * fresh query client whose readiness gate reports the `notifications` module
 * in `state`, with the app's real event invalidations connected so a test
 * fires `notification.push` by name.
 * @param state The `notifications` module state every readiness read answers.
 * @returns The `wrapper` to pass to `render`/`renderHook`, the client, and `emitEvent`.
 */
export function notificationsQueryWrapper(state: 'ready' | 'starting' | 'failed' = 'ready') {
  const { client, wrapper, emit } = createModulesTestWrapper(status('notifications', state));
  const { emit: emitEvent } = connectBridgeEvents(client);

  return { client, wrapper, emitModule: emit, emitEvent };
}

/**
 * Builds a fake center source whose every method is a spy: the list answers
 * an empty page and the unread count answers 0 unless a case overrides them.
 * @param overrides The methods a case cares about.
 * @returns A complete `NotificationCenterSource`.
 */
export function createCenterSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn().mockResolvedValue({ items: [], appliedLimit: 25, totalEver: 0, degraded: false }),
    getNotification: vi.fn().mockResolvedValue({ found: false }),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    archive: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    restore: vi.fn().mockResolvedValue({ affected: 0, unreadCount: 0, degraded: false }),
    executeAction: vi.fn().mockResolvedValue({ executed: true }),
    ...overrides,
  };
}
