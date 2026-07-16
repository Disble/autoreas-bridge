import catalogIcon from '@iconify-icons/solar/calendar-bold-duotone';
import chaptersIcon from '@iconify-icons/solar/list-check-bold-duotone';
import dashboardIcon from '@iconify-icons/solar/widget-5-bold-duotone';
import downloadIcon from '@iconify-icons/solar/download-bold-duotone';
import historyIcon from '@iconify-icons/solar/history-bold-duotone';
import networkIcon from '@iconify-icons/solar/server-2-bold-duotone';
import optionsIcon from '@iconify-icons/solar/settings-bold-duotone';
import pairingIcon from '@iconify-icons/solar/qr-code-bold-duotone';
import penIcon from '@iconify-icons/solar/pen-new-square-bold-duotone';
import seasonIcon from '@iconify-icons/solar/calendar-mark-bold-duotone';
import statusIcon from '@iconify-icons/solar/pulse-bold-duotone';

/** Primary navigation items shared by the desktop rail and mobile tab bar. */
export const APP_LAYOUT_NAV_ITEMS = [
  { to: '/network', label: 'Network', icon: networkIcon },
  { to: '/dashboard', label: 'Dashboard', icon: dashboardIcon },
  { to: '/catalog', label: 'Catalog', icon: catalogIcon },
  { to: '/history', label: 'History', icon: historyIcon },
  { to: '/chapters', label: 'Chapters', icon: chaptersIcon },
  { to: '/downloads', label: 'Downloads', icon: downloadIcon },
  { to: '/editor', label: 'Anime Editor', icon: penIcon },
  { to: '/status', label: 'Status', icon: statusIcon },
  { to: '/season', label: 'Season', icon: seasonIcon },
  { to: '/pairing', label: 'Pairing', icon: pairingIcon },
  { to: '/preferences', label: 'Opciones', icon: optionsIcon },
] as const;

/** Shared bridge mark path data used by the shell brand glyph. */
export const APP_LAYOUT_BRIDGE_MARK_PATHS = {
  arc: 'M3 17c3-8 15-8 18 0',
  leftNode: { cx: '5', cy: '17', r: '1.6' },
  rightNode: { cx: '19', cy: '17', r: '1.6' },
  mast: 'M12 4v3',
} as const;
