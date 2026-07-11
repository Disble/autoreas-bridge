import { ConnectedDevicesPanel } from '../../features/preferences/ui/ConnectedDevicesPanel/ConnectedDevicesPanel';
import { DownloadsRootPanel } from '../../features/preferences/ui/DownloadsRootPanel/DownloadsRootPanel';

/** Options category registry rendered by the Preferences route tab workspace. */
export const PREFERENCES_ROUTE_TABS = [
  {
    id: 'devices',
    label: 'Connected Devices',
    description: 'Review paired devices, sync status, and revoke access.',
    Panel: ConnectedDevicesPanel,
  },
  {
    id: 'downloads',
    label: 'Downloads',
    description: 'Configure where new season animes are downloaded.',
    Panel: DownloadsRootPanel,
  },
] as const;
