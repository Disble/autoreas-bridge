import type { ActivitySource } from './activity-source.types';

/** Wails runtime event carrying one recorder row (`activityRecorderEventName`, `app_activity_live.go`). */
export const ACTIVITY_RECORDER_EVENT_NAME = 'activity.recorder';

/** Rejection used when the Wails bindings never attached. */
export const ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE = 'runtime unavailable';

/** Module-local singleton container for the shared Activity source. */
export const ACTIVITY_SOURCE_STATE: { sharedSource: ActivitySource | null } = {
  sharedSource: null,
};

/** The MCP server the "Copy for AI" references name (`cmd/autoreas-request-mcp`). */
export const ACTIVITY_MCP_SERVER_NAME = 'autoreas-request-mcp';
