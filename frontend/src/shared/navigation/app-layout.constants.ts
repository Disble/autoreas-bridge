import activityIcon from '@iconify-icons/solar/pulse-bold-duotone';
import catalogIcon from '@iconify-icons/solar/calendar-bold-duotone';
import devicesIcon from '@iconify-icons/solar/devices-bold-duotone';
import downloadIcon from '@iconify-icons/solar/download-bold-duotone';
import historyIcon from '@iconify-icons/solar/history-bold-duotone';
import notificationsIcon from '@iconify-icons/solar/bell-bold-duotone';
import optionsIcon from '@iconify-icons/solar/settings-bold-duotone';
import penIcon from '@iconify-icons/solar/pen-new-square-bold-duotone';
import seasonIcon from '@iconify-icons/solar/calendar-mark-bold-duotone';
import todayIcon from '@iconify-icons/solar/list-check-bold-duotone';
import type { NavGroup } from './app-layout.types';

/**
 * Primary navigation groups shared by the desktop rail and mobile tab bar.
 * SYSTEM is bottom-pinned on the rail; the mobile tab bar renders the
 * flattened (`flattenNavItems`) order instead of grouped sections.
 */
export const APP_LAYOUT_NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'library',
    label: 'Library',
    items: [
      { to: '/today', label: 'Today', icon: todayIcon },
      { to: '/downloads', label: 'Downloads', icon: downloadIcon },
      { to: '/editor', label: 'Editor', icon: penIcon },
      { to: '/catalog', label: 'Catalog', icon: catalogIcon },
      { to: '/history', label: 'History', icon: historyIcon },
      { to: '/season', label: 'Season', icon: seasonIcon },
    ],
  },
  {
    id: 'sync',
    label: 'Sync',
    items: [{ to: '/devices', label: 'Devices', icon: devicesIcon }],
  },
  {
    id: 'system',
    label: 'System',
    pinned: true,
    items: [
      { to: '/activity', label: 'Activity', icon: activityIcon },
      { to: '/notifications', label: 'Notifications', icon: notificationsIcon },
      { to: '/settings', label: 'Settings', icon: optionsIcon },
    ],
  },
] as const;

/** Shared bridge mark path data used by the shell brand glyph. */
export const APP_LAYOUT_BRIDGE_MARK_PATHS = {
  arc: 'M3 17c3-8 15-8 18 0',
  leftNode: { cx: '5', cy: '17', r: '1.6' },
  rightNode: { cx: '19', cy: '17', r: '1.6' },
  mast: 'M12 4v3',
} as const;
