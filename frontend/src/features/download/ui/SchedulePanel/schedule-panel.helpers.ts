import type { ScheduleConfig } from '../../../../shared/contracts/download.types';
import { ALL_WEEKDAYS_MASK, WEEKDAY_OPTIONS } from './schedule-panel.constants';
import type { SchedulePanelViewModel, ScheduleSaveEdits } from './schedule-panel.types';

/**
 * Maps a 7-bit weekday mask (bit i = `time.Weekday(i)`, Sunday=0..Saturday=6)
 * to the set of ToggleButton ids that should appear selected, in the picker's
 * display order.
 */
export function maskToWeekdayValues(mask: number): string[] {
  const values: string[] = [];

  for (const option of WEEKDAY_OPTIONS) {
    if ((mask & (1 << option.bit)) !== 0) {
      values.push(option.value);
    }
  }

  return values;
}

/**
 * Folds a set of selected ToggleButton ids back into the 7-bit weekday mask,
 * OR-ing each known option's bit. Unknown ids are ignored.
 */
export function weekdayValuesToMask(values: Iterable<string>): number {
  const selected = new Set(values);

  return WEEKDAY_OPTIONS.reduce((mask, option) => (selected.has(option.value) ? mask | (1 << option.bit) : mask), 0);
}

/**
 * Computes the next instant the schedule would fire, mirroring the Go
 * scheduler's `nextDailyBoundaryAfter`: the first occurrence of `dailyTimeHHMM`
 * (local time) strictly after `now` that lands on an enabled weekday (bit i =
 * `time.Weekday(i)`, Sunday=0..Saturday=6). Returns the epoch-ms instant, or
 * `null` when the time is missing/invalid or no weekday is enabled.
 */
export function computeNextRunAtMs(now: Date, dailyTimeHHMM: string, enabledWeekdays: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(dailyTimeHHMM);
  if (match === null) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  if ((enabledWeekdays & ALL_WEEKDAYS_MASK) === 0) {
    return null;
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    const isEnabledDay = (enabledWeekdays & (1 << candidate.getDay())) !== 0;
    if (isEnabledDay && candidate.getTime() > now.getTime()) {
      return candidate.getTime();
    }
  }

  return null;
}

/**
 * Derives the "Next run" label: a live preview computed from the current
 * (enabled) config so the user sees their schedule take effect immediately,
 * falling back to "Not scheduled" when disabled or not fully configured.
 */
function toNextRunLabel(config: ScheduleConfig, now: Date): string {
  if (!config.enabled) {
    return 'Not scheduled';
  }

  const nextRunAtMs = computeNextRunAtMs(now, config.dailyTimeHHMM, config.enabledWeekdays);

  return nextRunAtMs === null ? 'Not scheduled' : new Date(nextRunAtMs).toLocaleString();
}

/**
 * Maps the live `ScheduleConfig` read-model into the panel's view model:
 * pass-through booleans/strings, human-readable last-run label ("Never" for the
 * zero-timestamp edge), a computed next-run preview, the weekday selection, and
 * a `willNeverRun` flag for the enabled-but-no-days edge case. `now` is injected
 * for deterministic testing and defaults to the current instant.
 */
export function toSchedulePanelViewModel(
  config: ScheduleConfig,
  now: Date = new Date(),
): Omit<SchedulePanelViewModel, 'seasonModeActive'> {
  return {
    enabled: config.enabled,
    dailyTimeHHMM: config.dailyTimeHHMM,
    running: config.running,
    lastRunLabel: config.lastRunAtMs === 0 ? 'Never' : new Date(config.lastRunAtMs).toLocaleString(),
    lastRunStatus: config.lastRunStatus,
    nextRunLabel: toNextRunLabel(config, now),
    enabledWeekdays: config.enabledWeekdays,
    selectedWeekdayValues: maskToWeekdayValues(config.enabledWeekdays),
    willNeverRun: config.enabled && config.enabledWeekdays === 0,
  };
}

/**
 * Builds the full `SetScheduleConfig` write request: starts from the
 * current config (preserving server-owned run/status fields the form never
 * edits) and overlays the user's edits (`enabled`, `dailyTimeHHMM`,
 * `enabledWeekdays`).
 */
export function toScheduleSaveRequest(current: ScheduleConfig, edits: ScheduleSaveEdits): ScheduleConfig {
  return {
    ...current,
    ...edits,
  };
}
