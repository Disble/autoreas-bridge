import { DownloadsRootPanel } from '../../features/preferences/ui/DownloadsRootPanel/DownloadsRootPanel';

/** Options category registry rendered by the Preferences route tab workspace. */
export const PREFERENCES_ROUTE_TABS = [
  {
    id: 'downloads',
    label: 'Downloads',
    description: 'Configure where new season animes are downloaded.',
    Panel: DownloadsRootPanel,
  },
] as const;
