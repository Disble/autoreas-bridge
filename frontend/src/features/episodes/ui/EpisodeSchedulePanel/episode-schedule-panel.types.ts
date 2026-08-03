import type { Anime } from '../../../../shared/contracts/anime.types';

/** Which lens groups the Episodes list: season watch states or weekdays. */
export type EpisodeViewLens = 'season' | 'daily';

/** Props accepted by the operational episode schedule panel. */
export interface EpisodeSchedulePanelProps {
  /** Optional source for tests or non-Wails adapters. */
  readonly source?: EpisodeScheduleSource;
  /** Optional initial day; defaults to the current legacy weekday or season lens. */
  readonly initialDay?: string;
}

/** Request/reply port used by the Episodes UI hook. */
export interface EpisodeScheduleSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly getEpisodeSchedule: (day: string) => Promise<readonly EpisodeScheduleItem[]>;
  readonly adjustWatchedEpisodes: (animeID: string, delta: number, base: number) => Promise<EpisodeCommandResult>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<EpisodeCommandResult>;
  readonly openAnimePage: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly copyAnimePage: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly openAnimeFolder: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly copyAnimeFolder: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly getAnimeCover: (animeID: string) => Promise<AnimeCover>;
  readonly getEpisodeDayCounts: () => Promise<readonly EpisodeDayCount[]>;
  /**
   * Subscribes to committed anime changes pushed by the backend so the panel
   * reflects writes made outside this window (mobile, REST API, background
   * downloads). Returns the unsubscribe handle.
   */
  readonly subscribeAnimeChanges: (listener: () => void) => () => void;
}

/** Wails-facing schedule item returned by the backend episode command service. */
export type EpisodeScheduleItem = Pick<
  Anime,
  'status' | 'episodesWatched' | 'totalEpisodes'
> & {
  readonly animeId: string;
  readonly animeName: string;
  readonly day: string;
  readonly dayOrder: number;
  readonly modified_at: number;
  readonly folderPath?: string;
  readonly pageUrl?: string;
  readonly hasCover: boolean;
  readonly lastWatched?: number;
  readonly firstWatched?: number;
};

/** Cover resolution result for one anime, fetched lazily and cached per session. */
export interface AnimeCover {
  readonly dataUrl?: string;
  readonly source: 'cover' | 'placeholder';
}

/** Per-weekday count of active, unresolved-progress anime (mirrors Legacy's buscarMedalla). */
export interface EpisodeDayCount {
  readonly day: string;
  readonly count: number;
}

/** In-memory, per-session cover cache entry keyed by anime id. */
export type CoverEntry = { readonly status: 'loading' | 'placeholder' } | { readonly status: 'cover'; readonly dataUrl: string };

/** Wails-facing result returned by episode write commands. */
export interface EpisodeCommandResult {
  readonly status: string;
  readonly message?: string;
  readonly animeId?: string;
  readonly animeName?: string;
  readonly animeStatus?: number;
  readonly episodesWatched?: number;
  readonly occurredAtMs?: number;
  readonly correlationId?: string;
}

/** View model row consumed by the dumb Episodes component. */
export interface EpisodeScheduleRow {
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
export interface InitialEpisodeSelectionInput {
  readonly isSeasonMode: boolean;
  readonly initialDay?: string;
  readonly today?: Date;
}

/** Props for one row card in the episode schedule list. */
export interface EpisodeScheduleCardProps {
  readonly row: EpisodeScheduleRow;
  readonly adjustWatchedEpisodes: (animeID: string, delta: number, base: number) => Promise<void>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<void>;
  readonly openAnimePage: (animeID: string) => Promise<void>;
  readonly copyAnimePage: (animeID: string) => Promise<void>;
  readonly openAnimeFolder: (animeID: string) => Promise<void>;
  readonly copyAnimeFolder: (animeID: string) => Promise<void>;
}
