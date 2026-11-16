/**
 * Event names that indicate the download run history or the schedule became stale.
 * `schedule.run_settled` (`scheduleRunSettledEventName`, `app_startup_runtime.go`) closes a
 * run: `download.run_finished` fires from inside the run, before the scheduler stores its
 * outcome and clears its running flag, so only a re-read on the settled event is final.
 */
export const DOWNLOAD_RUN_EVENT_NAMES = [
  'download.run_started',
  'download.run_progress',
  'download.run_finished',
  'download.episode_available',
  'download.episode_downloaded',
  'download.failed',
  'download.skipped',
  'download.jd_status',
  'download.episode_downloading',
  'schedule.run_settled',
] as const;

/**
 * Event name the backend emits when a startup-missed selected day settles
 * (`missedScheduleSettledEventName`, `app_notification_center.go`). It is not in
 * `DOWNLOAD_RUN_EVENT_NAMES`: those mean the run history went stale, and
 * settling a missed day is not a run.
 */
export const MISSED_SCHEDULE_SETTLED_EVENT_NAME = 'schedule.missed_settled';
