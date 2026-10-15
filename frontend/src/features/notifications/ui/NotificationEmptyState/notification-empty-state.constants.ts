import type { NotificationEmptyStateCopy, NotificationEmptyStateId } from './notification-empty-state.types';

/**
 * Kind and copy for every notification-list rendering (design.md §9.3), on the
 * shared empty-state shell (docs/design/patterns/empty-states.md). Only a list
 * that has never received anything shows the mascot; a filtered or archived
 * view shows the search icon, good news shows the success check, and an
 * unreachable service is a failure, rendered as an Alert.
 */
export const NOTIFICATION_EMPTY_STATE_COPY: Readonly<Record<NotificationEmptyStateId, NotificationEmptyStateCopy>> = {
  'never-recorded': {
    kind: 'first-run',
    title: 'Nothing here yet',
    description: 'Notifications will show up here once something happens.',
  },
  'filters-empty': {
    kind: 'filtered',
    title: 'No matches',
    description: 'No notification matches the current search or filters.',
  },
  'active-all-archived': {
    kind: 'caught-up',
    title: 'All archived',
    description: 'Every notification has been archived. Switch to the archived view to see them.',
  },
  'unread-none': {
    kind: 'caught-up',
    title: 'All caught up',
    description: 'There are no unread notifications.',
  },
  'archived-empty': {
    kind: 'filtered',
    title: 'Nothing archived yet',
    description: 'Notifications you archive will show up here.',
  },
  unavailable: {
    kind: 'failure',
    title: 'Notifications unavailable',
    description: 'The notification service could not be reached. Try again later.',
  },
};
