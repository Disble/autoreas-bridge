import { Icon } from '@iconify/react';
import { NOTIFICATION_EMPTY_STATE_COPY } from './notification-empty-state.constants';
import { selectNotificationEmptyState } from './notification-empty-state.helpers';
import type { NotificationEmptyStateProps } from './notification-empty-state.types';

/**
 * Dumb render of one of the six notification-list empty states, selected
 * from the current list conditions (design.md §9.3). Meant to be passed as
 * `NotificationTable`'s `renderEmptyState` render prop.
 */
export function NotificationEmptyState(props: Readonly<NotificationEmptyStateProps>) {
  const stateId = selectNotificationEmptyState(props);
  const copy = NOTIFICATION_EMPTY_STATE_COPY[stateId];

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" data-empty-state={stateId}>
      <Icon aria-hidden="true" className="size-10 text-default-400" icon={copy.icon} />
      <p className="text-sm font-medium text-foreground">{copy.title}</p>
      <p className="text-xs text-default-500">{copy.description}</p>
    </div>
  );
}
