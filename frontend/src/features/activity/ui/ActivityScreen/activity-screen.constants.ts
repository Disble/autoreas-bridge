import type { ActivityTabId } from './activity-screen.types';

/** Every tab id, in strip order. */
export const ACTIVITY_TAB_IDS: readonly ActivityTabId[] = ['now', 'incidents', 'history'];

/** Toast after "Pin this moment" succeeded. */
export const ACTIVITY_PIN_SUCCESS_MESSAGE = 'Moment pinned. The minutes around it are kept.';

/** Toast after "Pin this moment" failed. */
export const ACTIVITY_PIN_FAILURE_MESSAGE = 'Could not pin this moment.';
