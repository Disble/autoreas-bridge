import type { Anime } from './anime.types';

/**
 * One Today mark: the NEXT episode number and its stored runtime in whole
 * minutes, in one value so the two facts cannot disagree. Absent means the
 * row is unmarked and carries no chip; nil is omitted on the wire for the
 * same reason. Mirrors the generated `LongEpisodeMark` contract.
 */
export interface LongEpisodeMark {
  /** The NEXT episode number: watched progress + 1, looked up in the stored durations. */
  readonly episode: number;
  /** The stored runtime in whole minutes. */
  readonly minutes: number;
}

/** One row of the Today schedule, as `GetEpisodeSchedule` answers it. */
export type EpisodeScheduleItem = Pick<Anime, 'status' | 'episodesWatched' | 'totalEpisodes'> & {
  readonly animeId: string;
  readonly animeName: string;
  readonly day: string;
  readonly dayOrder: number;
  readonly modified_at: number;
  readonly folderPath?: string;
  readonly pageUrl?: string;
  readonly hasCover: boolean;
  /**
   * Marks the anime whose next episode runs long. Absent when unmarked, so
   * the row renders with no chip and no placeholder.
   */
  readonly longNextEpisode?: LongEpisodeMark;
  readonly lastWatched?: number;
  readonly firstWatched?: number;
};

/** Per-weekday count of active, unresolved-progress anime (mirrors Legacy's buscarMedalla). */
export interface EpisodeDayCount {
  readonly day: string;
  readonly count: number;
}

/**
 * Port of the episodes module's reads (ADR-032 §4); the Wails adapter is
 * `createEpisodesSource` (`infrastructure/bridge-runtime-source/episodes-source.helpers.ts`),
 * built once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
 * Both reads reject with a `BridgeError` and never answer `[]` in place of a
 * failure: `unavailable` while the module starts, `failed_precondition` once
 * it failed.
 */
export interface EpisodesSource {
  /** The schedule rows of one weekday key or season section. */
  readonly getEpisodeSchedule: (day: string) => Promise<readonly EpisodeScheduleItem[]>;
  /** The per-weekday badge counts. */
  readonly getEpisodeDayCounts: () => Promise<readonly EpisodeDayCount[]>;
}
