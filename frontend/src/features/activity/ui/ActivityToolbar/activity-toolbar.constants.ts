import type { IconifyIcon } from '@iconify/react';
import transferIcon from '@iconify-icons/solar/transfer-horizontal-bold';
import refreshIcon from '@iconify-icons/solar/refresh-bold';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-bold';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import penIcon from '@iconify-icons/solar/pen-bold';
import bridgeIcon from '@iconify-icons/solar/server-bold';
import type { ActivityFailureButtonState } from '../../feed/activity-feed.types';
import type { ActivityFeedType } from '../../feed-source/feed.types';

/** The icon of each failure-menu row: one icon per row (design, The menu). */
export const ACTIVITY_TYPE_ICONS: Readonly<Record<ActivityFeedType, IconifyIcon>> = {
  change: transferIcon,
  traffic: refreshIcon,
  download: downloadIcon,
  task: clockIcon,
  edit: penIcon,
  bridge: bridgeIcon,
};

/** The failure pill's HeroUI variant by state: soft while off or open, solid while on with the menu closed. */
export const ACTIVITY_FAILURE_BUTTON_VARIANT: Readonly<Record<ActivityFailureButtonState, 'danger' | 'danger-soft'>> = {
  off: 'danger-soft',
  open: 'danger-soft',
  on: 'danger',
};

/** The failure pill's tooltip by state. */
export const ACTIVITY_FAILURE_BUTTON_TOOLTIP: Readonly<Record<ActivityFailureButtonState, string>> = {
  off: 'Show only failures',
  open: 'Failures by type',
  on: 'Failures by type',
};
