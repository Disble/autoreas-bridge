import type { DrawerTechnicalTab } from '../../drawer/drawer.types';

/** Words of each technical tab. */
export const ACTIVITY_TECHNICAL_TAB_LABELS: Readonly<Record<DrawerTechnicalTab, string>> = {
  requests: 'Requests',
  events: 'Events',
  data: 'Data',
};

/** Chip color per event level; an unknown level stays neutral. */
export const ACTIVITY_TECHNICAL_LEVEL_COLORS: Readonly<Record<string, 'danger' | 'warning' | 'default'>> = {
  error: 'danger',
  warn: 'warning',
};

/** The chip of a body cut at the capture limit (`requestcapture.MaxCapturedBodyBytes`). */
export const ACTIVITY_TECHNICAL_CUT_LABEL = 'Cut at 64 KB';

/** Loading label of the picked request. */
export const ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL = 'Loading the request';
