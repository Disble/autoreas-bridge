/** Props for the `SchedulePanel` dumb-UI component. */
export interface SchedulePanelProps {
  readonly className?: string;
}

/** Loading/error/ready states for the schedule panel (2026 quality bar). */
export type SchedulePanelStatus = 'loading' | 'error' | 'ready';

/** A single weekday choice in the picker: a stable id, a label, and its Go-mask bit index. */
export interface WeekdayOption {
  readonly value: string;
  readonly label: string;
  readonly bit: number;
}

/** View model rendered by `SchedulePanel`, derived from `ScheduleConfig`. */
export interface SchedulePanelViewModel {
  readonly enabled: boolean;
  readonly dailyTimeHHMM: string;
  readonly running: boolean;
  readonly lastRunLabel: string;
  readonly lastRunStatus: string;
  readonly nextRunLabel: string;
  readonly enabledWeekdays: number;
  /** ToggleButton ids of the currently-enabled weekdays, for `selectedKeys`. */
  readonly selectedWeekdayValues: readonly string[];
  /** True when the schedule is enabled but NO weekday is selected — it will never fire. */
  readonly willNeverRun: boolean;
}

/** The user-editable subset of `ScheduleConfig` the form can change. */
export interface ScheduleSaveEdits {
  readonly enabled: boolean;
  readonly dailyTimeHHMM: string;
  readonly enabledWeekdays: number;
}
