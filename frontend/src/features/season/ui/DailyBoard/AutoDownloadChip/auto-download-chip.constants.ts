import type { AutoDownloadChipView } from './auto-download-chip.types';

/** Label while a scheduler run is in progress. */
export const AUTO_DOWNLOAD_DOWNLOADING_LABEL = 'Downloading';

/** Tooltip while a scheduler run is in progress. */
export const AUTO_DOWNLOAD_DOWNLOADING_TOOLTIP = 'Download in progress';

/** The chip on a day the schedule does not run. */
export const AUTO_DOWNLOAD_NONE_TODAY: AutoDownloadChipView = {
  kind: 'noneToday',
  label: 'No download',
  tooltip: 'No scheduled download today',
  isActive: false,
};

/** Matches a 24-hour daily time, "22:00" or "9:05": the hour may have one digit, as the scheduler accepts. */
export const AUTO_DOWNLOAD_DAILY_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Label when scheduled downloads are disabled. */
export const AUTO_DOWNLOAD_OFF_LABEL = 'Off';

/** Tooltip when scheduled downloads are disabled. */
export const AUTO_DOWNLOAD_OFF_TOOLTIP = 'Scheduled downloads are off';

/**
 * How early a run may be recorded and still count as today's scheduled one: the
 * scheduler stamps the run when its timer fires, at or just after the configured minute.
 */
export const AUTO_DOWNLOAD_RUN_TOLERANCE_MS = 60_000;

/** How often the chip re-reads the clock, so it moves on at the scheduled time and at midnight. */
export const AUTO_DOWNLOAD_CLOCK_TICK_MS = 60_000;

/** The run status the scheduler records for a run that finished cleanly. */
export const AUTO_DOWNLOAD_OK_STATUS = 'ok';
