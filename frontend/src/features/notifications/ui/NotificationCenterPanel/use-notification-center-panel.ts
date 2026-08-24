import { useMemo } from 'react';
import { createNotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.helpers';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { toNotificationEmptyStateConditions } from './notification-center-panel.helpers';
import type { NotificationCenterPanelResult } from './notification-center-panel.types';
import { useNotificationCenterSync, type NotificationCenterSyncView } from './use-notification-center-sync';

/** Fixed archive view until Slice 3b wires the active/archived toggle onto the panel. */
const PANEL_DEFAULT_VIEW: NotificationCenterSyncView = 'active';
/** Fixed unread-only filter until Slice 3b wires the selection/search toolbar onto the panel. */
const PANEL_DEFAULT_UNREAD_ONLY = false;

/**
 * Wires `useNotificationCenterSync`'s master-list page into
 * `NotificationTable` + `NotificationEmptyState`'s props. Selection, search,
 * and the archived/unread toggles are Slice 3b's addition to this hook.
 */
export function useNotificationCenterPanel(
  source: NotificationCenterSource = createNotificationCenterSource(),
): NotificationCenterPanelResult {
  // 4. Queries/Mutations
  const { rows, isLoading, hasNextPage, totalEverRecorded, degraded, onLoadMore } = useNotificationCenterSync({
    source,
    unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
    view: PANEL_DEFAULT_VIEW,
  });

  // 5. Derived State (useMemo)
  const emptyStateConditions = useMemo(
    () =>
      toNotificationEmptyStateConditions({
        totalEverRecorded,
        view: PANEL_DEFAULT_VIEW,
        unreadOnly: PANEL_DEFAULT_UNREAD_ONLY,
        degraded,
      }),
    [totalEverRecorded, degraded],
  );

  return { rows, isLoading, hasNextPage, onLoadMore, emptyStateConditions };
}
