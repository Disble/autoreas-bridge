/** Props accepted by the operational chapter schedule panel. */
export interface ChapterSchedulePanelProps {
  /** Optional source for tests or non-Wails adapters. */
  readonly source?: ChapterScheduleSource;
  /** Optional initial day; defaults to the current legacy weekday or season lens. */
  readonly initialDay?: string;
}

/** Request/reply port used by the Chapters UI hook. */
export interface ChapterScheduleSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getChapterSchedule: (day: string) => Promise<readonly ChapterScheduleItem[]>;
  readonly adjustWatchedChapters: (animeID: string, delta: number, base: number) => Promise<ChapterCommandResult>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<ChapterCommandResult>;
  readonly openAnimePage: (animeID: string) => Promise<ChapterCommandResult>;
  readonly copyAnimePage: (animeID: string) => Promise<ChapterCommandResult>;
  readonly openAnimeFolder: (animeID: string) => Promise<ChapterCommandResult>;
  readonly copyAnimeFolder: (animeID: string) => Promise<ChapterCommandResult>;
  readonly getAnimeCover: (animeID: string) => Promise<AnimeCover>;
  readonly getChapterDayCounts: () => Promise<readonly ChapterDayCount[]>;
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
  readonly folderPath?: string;
  readonly pageUrl?: string;
  readonly hasCover: boolean;
  readonly lastWatched?: number;
  readonly firstWatched?: number;
}

/** Cover resolution result for one anime, fetched lazily and cached per session. */
export interface AnimeCover {
  readonly dataUrl?: string;
  readonly source: 'cover' | 'placeholder';
}

/** Per-weekday count of active, unresolved-progress anime (mirrors Legacy's buscarMedalla). */
export interface ChapterDayCount {
  readonly day: string;
  readonly count: number;
}

/** In-memory, per-session cover cache entry keyed by anime id. */
export type CoverEntry = { readonly status: 'loading' | 'placeholder' } | { readonly status: 'cover'; readonly dataUrl: string };

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
  readonly progressTitle: string;
  readonly totalLabel: string;
  readonly modifiedAt: number;
  readonly hasPage: boolean;
  readonly hasFolder: boolean;
  readonly folderPath: string;
  readonly pageUrl: string;
  readonly coverDataUrl?: string;
  readonly showCoverPlaceholder: boolean;
}

/** Input used to resolve the initial schedule filter. */
export interface InitialChapterSelectionInput {
  readonly isSeasonMode: boolean;
  readonly initialDay?: string;
  readonly today?: Date;
}

/** Props for one row card in the chapter schedule list. */
export interface ChapterScheduleCardProps {
  readonly row: ChapterScheduleRow;
  readonly adjustWatchedChapters: (animeID: string, delta: number, base: number) => Promise<void>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<void>;
  readonly openAnimePage: (animeID: string) => Promise<void>;
  readonly copyAnimePage: (animeID: string) => Promise<void>;
  readonly openAnimeFolder: (animeID: string) => Promise<void>;
  readonly copyAnimeFolder: (animeID: string) => Promise<void>;
}
