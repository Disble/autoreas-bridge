import type { ScheduleConfig } from '../../../../../shared/contracts/download.types';
import {
  AUTO_DOWNLOAD_DAILY_TIME_PATTERN,
  AUTO_DOWNLOAD_DOWNLOADING_LABEL,
  AUTO_DOWNLOAD_DOWNLOADING_TOOLTIP,
  AUTO_DOWNLOAD_NONE_TODAY,
  AUTO_DOWNLOAD_OFF_LABEL,
  AUTO_DOWNLOAD_OFF_TOOLTIP,
  AUTO_DOWNLOAD_OK_STATUS,
  AUTO_DOWNLOAD_RUN_TOLERANCE_MS,
} from './auto-download-chip.constants';
import type { AutoDownloadChipView } from './auto-download-chip.types';

/**
 * Today's scheduled time as a local instant, or null when the daily time is not
 * a valid "HH:MM" (the scheduler then fires nothing either).
 */
function getScheduledAt(dailyTimeHHMM: string, now: Date): Date | null {
  const match = AUTO_DOWNLOAD_DAILY_TIME_PATTERN.exec(dailyTimeHHMM);

  if (match === null) {
    return null;
  }

  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]));
}

/**
 * getAutoDownloadChip says what today's scheduled download looks like, from the
 * Downloads schedule read-model and the current time. Disabled wins over
 * everything; then a run in progress; then whether today is a selected day
 * (bit `now.getDay()` of the mask, Sunday = 0, as the scheduler reads it); then
 * whether the time is still ahead (the scheduled instant itself still counts as
 * ahead; the scheduler fires right after it and the run then shows as
 * downloading); once it has passed, whether today's run finished `ok`.
 *
 * @param config The Downloads schedule read-model.
 * @param now The current local time.
 */
export function getAutoDownloadChip(config: ScheduleConfig, now: Date): AutoDownloadChipView {
  if (!config.enabled) {
    return { kind: 'off', label: AUTO_DOWNLOAD_OFF_LABEL, tooltip: AUTO_DOWNLOAD_OFF_TOOLTIP, isActive: false };
  }

  if (config.running) {
    return { kind: 'downloading', label: AUTO_DOWNLOAD_DOWNLOADING_LABEL, tooltip: AUTO_DOWNLOAD_DOWNLOADING_TOOLTIP, isActive: true };
  }

  const scheduledAt = getScheduledAt(config.dailyTimeHHMM, now);

  if (scheduledAt === null || (config.enabledWeekdays & (1 << now.getDay())) === 0) {
    return AUTO_DOWNLOAD_NONE_TODAY;
  }

  const time = config.dailyTimeHHMM;

  if (now.getTime() <= scheduledAt.getTime()) {
    return { kind: 'scheduled', label: time, tooltip: `Scheduled download at ${time}`, isActive: true };
  }

  const ranToday = config.lastRunAtMs > scheduledAt.getTime() - AUTO_DOWNLOAD_RUN_TOLERANCE_MS;

  if (ranToday && config.lastRunStatus === AUTO_DOWNLOAD_OK_STATUS) {
    return { kind: 'downloaded', label: time, tooltip: `Downloaded at ${time}`, isActive: false };
  }

  return { kind: 'notCompleted', label: time, tooltip: `The ${time} download did not complete`, isActive: false };
}
