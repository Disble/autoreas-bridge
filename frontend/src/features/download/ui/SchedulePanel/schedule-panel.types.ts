/** Props for the `SchedulePanel` dumb-UI component. */
export interface SchedulePanelProps {
  readonly className?: string;
}

/** Loading/error/ready states for the schedule panel (2026 quality bar). */
export type SchedulePanelStatus = 'loading' | 'error' | 'ready';

/** View model rendered by `SchedulePanel`, derived from `ScheduleConfig`. */
export interface SchedulePanelViewModel {
  readonly enabled: boolean;
  readonly dailyTimeHHMM: string;
  readonly running: boolean;
  readonly lastRunLabel: string;
  readonly lastRunStatus: string;
  readonly nextRunLabel: string;
}

/** The user-editable subset of `ScheduleConfig` the form can change. */
export interface ScheduleSaveEdits {
  readonly enabled: boolean;
  readonly dailyTimeHHMM: string;
}
