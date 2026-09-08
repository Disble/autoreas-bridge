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

/** Read-only view model for the startup-only missed selected-day notice alert. */
export interface ScheduleMissedNoticeViewModel {
  readonly localDate: string;
  readonly dueLabel: string;
  readonly attemptStatus?: string;
}

/** One scheduled anime whose local readiness currently blocks a download check. */
export interface ScheduleBlockedAnimeViewModel {
  readonly name: string;
  readonly reasonLabels: readonly string[];
}

/** Summary rendered before the scheduler runs, with named local blockers. */
export interface ScheduleReadinessViewModel {
  readonly scheduledTotal: number;
  readonly scheduledReady: number;
  readonly scheduledBlocked: number;
  readonly blockedAnime: readonly ScheduleBlockedAnimeViewModel[];
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
  /** True when the schedule is enabled and the current local weekday is selected. */
  readonly isScheduledToday: boolean;
  /** True when season mode is active — each run downloads the "Ver hoy" set. */
  readonly seasonModeActive: boolean;
  readonly missedNotice?: ScheduleMissedNoticeViewModel;
  readonly readiness?: ScheduleReadinessViewModel;
};

/** The user-editable subset of `ScheduleConfig` the form can change. */
export type ScheduleSaveEdits = Pick<
  ScheduleConfig,
  'enabled' | 'dailyTimeHHMM' | 'enabledWeekdays'
>;

/** Props for the `ScheduleSaveErrorAlert` dumb-UI component. */
export interface ScheduleSaveErrorAlertProps {
  readonly message: string | undefined;
}

/** Props for the `ScheduleSeasonModeBanner` dumb-UI component. */
export interface ScheduleSeasonModeBannerProps {
  readonly isActive: boolean;
}

/** Props for the `ScheduleMissedScheduleSection` dumb-UI component. */
export interface ScheduleMissedScheduleSectionProps {
  readonly notice: ScheduleMissedNoticeViewModel | undefined;
  readonly isResolvingMissedAction: boolean;
  readonly actionMessage: string | undefined;
  readonly onRunNow: (localDate: string) => void;
  readonly onIgnore: (localDate: string) => void;
}

/** Props for the `ScheduleReadinessSection` dumb-UI component. */
export interface ScheduleReadinessSectionProps {
  readonly readinessErrorMessage: string | undefined;
  readonly onRetryReadiness: () => void;
  readonly readiness: ScheduleReadinessViewModel | undefined;
  readonly isScheduledToday: boolean;
}

/** Props for the `ScheduleWeekdayPicker` dumb-UI component. */
export interface ScheduleWeekdayPickerProps {
  readonly isDisabled: boolean;
  readonly selectedWeekdayValues: readonly string[];
  readonly willNeverRun: boolean;
  readonly onWeekdaysChange: (mask: number) => void;
}

/** Props for the `ScheduleRunStatusFooter` dumb-UI component. */
export interface ScheduleRunStatusFooterProps {
  readonly lastRunLabel: string;
  readonly lastRunStatus: string;
  readonly nextRunLabel: string;
  readonly running: boolean;
}
