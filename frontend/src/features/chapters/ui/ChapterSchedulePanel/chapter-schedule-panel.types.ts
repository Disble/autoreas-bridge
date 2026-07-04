/** Props accepted by the operational chapter schedule panel. */
export interface ChapterSchedulePanelProps {
  /** Optional source for tests or non-Wails adapters. */
  readonly source?: ChapterScheduleSource;
  /** Optional initial day; defaults to the current legacy weekday. */
  readonly initialDay?: string;
}

/** Request/reply port used by the Chapters UI hook. */
export interface ChapterScheduleSource {
  readonly getChapterSchedule: (day: string) => Promise<readonly ChapterScheduleItem[]>;
  readonly adjustWatchedChapters: (animeID: string, delta: number, base: number) => Promise<ChapterCommandResult>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<ChapterCommandResult>;
}

/** Wails-facing schedule item returned by the backend chapter command service. */
export interface ChapterScheduleItem {
  readonly animeId: string;
  readonly animeName: string;
  readonly estado: number;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly day: string;
  readonly dayOrder: number;
  readonly modified_at: number;
  readonly hasPage: boolean;
  readonly hasFolder: boolean;
  readonly lastWatched?: number;
  readonly firstWatched?: number;
}

/** Wails-facing result returned by chapter write commands. */
export interface ChapterCommandResult {
  readonly status: string;
  readonly message?: string;
  readonly animeId?: string;
  readonly animeName?: string;
  readonly estado?: number;
  readonly nrocapvisto?: number;
  readonly occurredAtMs?: number;
  readonly correlationId?: string;
}

/** View model row consumed by the dumb Chapters component. */
export interface ChapterScheduleRow {
  readonly id: string;
  readonly name: string;
  readonly stateLabel: string;
  readonly isProgressBlocked: boolean;
  readonly watchedLabel: string;
  readonly remainingLabel: string;
  readonly totalLabel: string;
  readonly modifiedAt: number;
  readonly hasPage: boolean;
  readonly hasFolder: boolean;
}
