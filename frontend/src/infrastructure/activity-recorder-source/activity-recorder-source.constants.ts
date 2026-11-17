import type { ActivityRecorderSource } from '../../shared/contracts/activity-recorder.types';

/** Wails runtime event carrying one recorder row (`activityRecorderEventName`, `app_activity_live.go`). */
export const ACTIVITY_RECORDER_EVENT_NAME = 'activity.recorder';

/** Module-local singleton container for the shared recorder source. */
export const ACTIVITY_RECORDER_SOURCE_STATE: { sharedSource: ActivityRecorderSource | null } = {
  sharedSource: null,
};
