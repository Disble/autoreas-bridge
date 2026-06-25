import type { ScheduleConfig } from '../../../../shared/contracts/download.types';
import { WEEKDAY_OPTIONS } from './schedule-panel.constants';
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
 * Maps the live `ScheduleConfig` read-model into the panel's view model:
 * pass-through booleans/strings, human-readable last/next-run labels
 * ("Never" / "Not scheduled" for the zero-timestamp edge cases), the weekday
 * selection, and a `willNeverRun` flag for the enabled-but-no-days edge case.
 */
export function toSchedulePanelViewModel(config: ScheduleConfig): SchedulePanelViewModel {
  return {
    enabled: config.enabled,
    dailyTimeHHMM: config.dailyTimeHHMM,
    running: config.running,
    lastRunLabel: config.lastRunAtMs === 0 ? 'Never' : new Date(config.lastRunAtMs).toLocaleString(),
    lastRunStatus: config.lastRunStatus,
    nextRunLabel: config.enabled && config.nextRunAtMs > 0 ? new Date(config.nextRunAtMs).toLocaleString() : 'Not scheduled',
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
