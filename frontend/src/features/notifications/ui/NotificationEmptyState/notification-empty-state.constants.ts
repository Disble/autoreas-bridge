import type { IconifyIcon } from '@iconify/react';
import archiveIcon from '@iconify-icons/solar/archive-bold-duotone';
import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import cloudCrossIcon from '@iconify-icons/solar/cloud-cross-bold-duotone';
import inboxArchiveIcon from '@iconify-icons/solar/inbox-archive-bold-duotone';
import magniferIcon from '@iconify-icons/solar/magnifer-bold-duotone';
import bellBingIcon from '@iconify-icons/solar/bell-bing-bold-duotone';
import type { NotificationEmptyStateId } from './notification-empty-state.types';

/** One empty state's icon + title/description copy. */
export interface NotificationEmptyStateCopy {
  readonly icon: IconifyIcon;
  readonly title: string;
  readonly description: string;
}

/** Icon + copy for every notification empty-state rendering (design.md §9.3). */
export const NOTIFICATION_EMPTY_STATE_COPY: Readonly<Record<NotificationEmptyStateId, NotificationEmptyStateCopy>> = {
  'never-recorded': {
    icon: bellBingIcon,
    title: 'Nothing here yet',
    description: 'Notifications will show up here once something happens.',
  },
  'filters-empty': {
    icon: magniferIcon,
    title: 'No matches',
    description: 'No notification matches the current search or filters.',
  },
  'active-all-archived': {
    icon: inboxArchiveIcon,
    title: 'All archived',
    description: 'Every notification has been archived. Switch to the archived view to see them.',
  },
  'unread-none': {
    icon: checkCircleIcon,
    title: 'All caught up',
    description: 'There are no unread notifications.',
  },
  'archived-empty': {
    icon: archiveIcon,
    title: 'Nothing archived yet',
    description: 'Notifications you archive will show up here.',
  },
  unavailable: {
    icon: cloudCrossIcon,
    title: 'Notifications unavailable',
    description: 'The notification service could not be reached. Try again later.',
  },
};
