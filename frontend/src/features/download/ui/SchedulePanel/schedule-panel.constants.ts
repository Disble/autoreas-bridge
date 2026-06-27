import type { ScheduleConfig } from '../../../../shared/contracts/download.types';
import type { WeekdayOption } from './schedule-panel.types';

/** Full 7-bit weekday mask (every day enabled) — mirrors the Go `all-days=127` sentinel. */
export const ALL_WEEKDAYS_MASK = 127;

/**
 * Weekday picker options. `bit` is the `time.Weekday` index (Sunday=0..Saturday=6)
 * matching the Go mask encoding; `value` is the stable ToggleButton id. Rendered
 * Monday-first for UX while keeping the bit decoupled from display order.
 */
export const WEEKDAY_OPTIONS: readonly WeekdayOption[] = [
  { value: '1', label: 'Mon', bit: 1 },
  { value: '2', label: 'Tue', bit: 2 },
  { value: '3', label: 'Wed', bit: 3 },
  { value: '4', label: 'Thu', bit: 4 },
  { value: '5', label: 'Fri', bit: 5 },
  { value: '6', label: 'Sat', bit: 6 },
  { value: '0', label: 'Sun', bit: 0 },
];

/** Safe default schedule config shown before the first `getScheduleConfig` resolves. */
export const SCHEDULE_PANEL_EMPTY_CONFIG: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '',
  enabled: false,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: ALL_WEEKDAYS_MASK,
};
