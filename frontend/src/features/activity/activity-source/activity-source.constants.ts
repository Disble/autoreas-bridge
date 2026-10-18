import type { ActivityWhere, ActivityWhereOption } from './activity-incident.types';
import type { ActivitySource } from './activity-source.types';

/** Wails runtime event carrying one recorder row (`activityRecorderEventName`, `app_activity_live.go`). */
export const ACTIVITY_RECORDER_EVENT_NAME = 'activity.recorder';

/** Rejection used when the Wails bindings never attached. */
export const ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE = 'runtime unavailable';

/** Module-local singleton container for the shared Activity source. */
export const ACTIVITY_SOURCE_STATE: { sharedSource: ActivitySource | null } = {
  sharedSource: null,
};

/** The "where it happened" filter, in toggle order (design, "Navigation"). */
export const ACTIVITY_WHERE_OPTIONS: readonly ActivityWhereOption[] = [
  { id: 'all', label: 'All' },
  { id: 'phone', label: 'Phone and sync' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'editor', label: 'Editor' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'season', label: 'Season' },
];

/** The filters that read internal bridge work, whose runs open a run story. */
export const ACTIVITY_INTERNAL_WHERE: readonly ActivityWhere[] = ['downloads', 'editor', 'schedule', 'season'];

/** The MCP server the "Copy for AI" references name (`cmd/autoreas-request-mcp`). */
export const ACTIVITY_MCP_SERVER_NAME = 'autoreas-request-mcp';
