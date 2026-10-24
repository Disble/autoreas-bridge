import type { DrawerBodyStatus } from '../../drawer/drawer-reads.helpers';
import type { DrawerDataBlock, DrawerEventRow, DrawerHttpHeader, DrawerOccurrence, DrawerRequestGroup, DrawerRequestPanel, DrawerTechnicalTab, DrawerWindowErrorDetail } from '../../drawer/drawer.types';
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
  /** The occurrences of a repeated window error; empty when it did not repeat. */
  readonly occurrences: readonly DrawerOccurrence[];
  /** The shown occurrence id; undefined without occurrences. */
  readonly selectedOccurrenceId: number | undefined;
  /** The read state of the shown occurrence. */
  readonly occurrenceStatus: DrawerBodyStatus;
  /** Picks an occurrence. */
  readonly onPickOccurrence: (id: number) => void;
  /** Reads the picked occurrence again. */
  readonly onRetryOccurrence: () => void;
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
export interface ActivityTechnicalWindowErrorProps
  extends Pick<ActivityTechnicalViewProps, 'occurrences' | 'selectedOccurrenceId' | 'occurrenceStatus' | 'onPickOccurrence' | 'onRetryOccurrence'> {
  /** The shown window error; undefined while a picked occurrence is not read. */
  readonly detail: DrawerWindowErrorDetail | undefined;
}

/** One coloured run of a JSON body: a key, a string value, or plain text. */
export interface ActivityJsonToken {
  /** What the run is. */
  readonly kind: 'key' | 'string' | 'plain';
  /** Where the run starts in the shown text; it also keys the run. */
  readonly offset: number;
  /** Its text, as shown. */
  readonly text: string;
}

/** Props of a stored JSON body. */
export interface ActivityTechnicalJsonProps {
  /** The stored body. */
  readonly raw: string;
}

/** Props of the empty state of a technical tab. */
export interface ActivityTechnicalEmptyProps {
  /** What is missing. */
  readonly title: string;
  /** Why it is missing. */
  readonly description: string;
}

/** Props of the stored headers of one side of the picked request. */
export interface ActivityTechnicalHeadersProps {
  /** Which side, for the list's accessible name. */
  readonly label: string;
  /** The headers as stored; nothing renders when empty. */
  readonly headers: readonly DrawerHttpHeader[];
}
