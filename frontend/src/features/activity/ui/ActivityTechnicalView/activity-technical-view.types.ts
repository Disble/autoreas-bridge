import type { DrawerDataBlock, DrawerEventRow, DrawerRequestGroup, DrawerRequestPanel, DrawerTechnicalTab, DrawerWindowErrorDetail } from '../../drawer/drawer.types';
import type { ActivityRead } from '../ActivityRunStory/activity-run-story.types';

/** Props of the technical view of the detail drawer. */
export interface ActivityTechnicalViewProps {
  /** What the summary could not translate, said once above the tabs. */
  readonly gaps: readonly string[];
  /** The line's tabs, in order. */
  readonly tabs: readonly DrawerTechnicalTab[];
  /** The open tab. */
  readonly tab: DrawerTechnicalTab;
  /** Opens a tab. */
  readonly onSelectTab: (tab: DrawerTechnicalTab) => void;
  /** Whether the line failed; it decides the empty Requests wording. */
  readonly lineFailed: boolean;
  /** The route-and-status groups of the Requests tab. */
  readonly groups: readonly DrawerRequestGroup[];
  /** The picked group's key. */
  readonly selectedGroupKey: string | undefined;
  /** Picks a group. */
  readonly onPickGroup: (groupKey: string) => void;
  /** Status of the picked request's read; undefined when none is read. */
  readonly requestStatus: ActivityRead<unknown>['status'] | undefined;
  /** The picked request, once read. */
  readonly panel: DrawerRequestPanel | undefined;
  /** Reads the picked request again. */
  readonly onRetryRequest: () => void;
  /** The Events tab rows. */
  readonly events: readonly DrawerEventRow[];
  /** Why the Events tab is empty, when known; empty otherwise. */
  readonly eventsEmpty: string;
  /** The Data tab blocks. */
  readonly data: readonly DrawerDataBlock[];
  /** The stored window error, shown in Data instead of the raw blocks; undefined for other events. */
  readonly windowError: DrawerWindowErrorDetail | undefined;
}

/** Props of the Requests tab. */
export interface ActivityTechnicalRequestsProps {
  /** Whether the line failed; it decides the empty wording. */
  readonly lineFailed: boolean;
  /** The route-and-status groups. */
  readonly groups: readonly DrawerRequestGroup[];
  /** The picked group's key. */
  readonly selectedGroupKey: string | undefined;
  /** Picks a group. */
  readonly onPickGroup: (groupKey: string) => void;
  /** Status of the picked request's read. */
  readonly requestStatus: ActivityRead<unknown>['status'] | undefined;
  /** The picked request, once read. */
  readonly panel: DrawerRequestPanel | undefined;
  /** Reads the picked request again. */
  readonly onRetryRequest: () => void;
}

/** Props of the picked request panel. */
export interface ActivityTechnicalRequestPanelProps {
  /** The picked request. */
  readonly panel: DrawerRequestPanel;
}

/** Props of the Data tab of a window error. */
export interface ActivityTechnicalWindowErrorProps {
  /** The stored window error. */
  readonly detail: DrawerWindowErrorDetail;
}
