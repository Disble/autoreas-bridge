import type { ScheduleConfig } from '../../../../shared/contracts/download.types';

/** Props for the `SchedulePanel` dumb-UI component. */
export interface SchedulePanelProps {
  readonly className?: string;
}

/** A single weekday choice in the picker: a stable id, a label, and its Go-mask bit index. */
export interface WeekdayOption {
  readonly value: string;
  readonly label: string;
  readonly bit: number;
}

/** View model rendered by `SchedulePanel`, derived from `ScheduleConfig` and preferences. */
export type SchedulePanelViewModel = Pick<
  ScheduleConfig,
  'enabled' | 'dailyTimeHHMM' | 'running' | 'lastRunStatus' | 'enabledWeekdays'
> & {
  readonly lastRunLabel: string;
  readonly nextRunLabel: string;
  /** ToggleButton ids of the currently-enabled weekdays, for `selectedKeys`. */
  readonly selectedWeekdayValues: readonly string[];
  /** True when the schedule is enabled but NO weekday is selected — it will never fire. */
  readonly willNeverRun: boolean;
  /** True when season mode is active — each run downloads the "Ver hoy" set. */
  readonly seasonModeActive: boolean;
};

/** The user-editable subset of `ScheduleConfig` the form can change. */
export type ScheduleSaveEdits = Pick<
  ScheduleConfig,
  'enabled' | 'dailyTimeHHMM' | 'enabledWeekdays'
>;
