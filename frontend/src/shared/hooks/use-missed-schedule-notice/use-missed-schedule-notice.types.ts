import type { ScheduleMissedNotice } from '../../contracts/download.types';

/** Shared controller contract for Today, Downloads, and the app-shell failure alert. */
export interface MissedScheduleNoticeController {
  readonly decisionNotice?: ScheduleMissedNotice;
  readonly failureNotice?: ScheduleMissedNotice;
  readonly isResolving: boolean;
  readonly actionMessage?: string;
  readonly runNow: (localDate: string) => Promise<void>;
  readonly ignore: (localDate: string) => Promise<void>;
}
