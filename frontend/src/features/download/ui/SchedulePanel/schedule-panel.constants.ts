import type { ScheduleConfig } from '../../../../shared/contracts/download.types';

/** Safe default schedule config shown before the first `getScheduleConfig` resolves. */
export const SCHEDULE_PANEL_EMPTY_CONFIG: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '',
  enabled: false,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
};
