import { BackupPanel } from '../../features/backup/ui/BackupPanel/BackupPanel';
import { AutoStartPanel } from '../../features/preferences/ui/AutoStartPanel/AutoStartPanel';
import { DownloadsRootPanel } from '../../features/preferences/ui/DownloadsRootPanel/DownloadsRootPanel';

/** Options category registry rendered by the Preferences route tab workspace. */
export const PREFERENCES_ROUTE_TABS = [
  {
    id: 'downloads',
    label: 'Downloads',
    description: 'Configure where new season animes are downloaded.',
    Panel: DownloadsRootPanel,
  },
  {
    id: 'backup',
    label: 'Backup',
    description: 'Export your anime catalog and seasons to a portable backup file.',
    Panel: BackupPanel,
  },
  {
    id: 'startup',
    label: 'Startup',
    description: 'Control whether Bridge launches when you sign in to Windows.',
    Panel: AutoStartPanel,
  },
] as const;
