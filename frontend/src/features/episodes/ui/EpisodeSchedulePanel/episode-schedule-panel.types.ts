import type { ReactNode } from 'react';
import type { EpisodeScheduleItem, EpisodesSource } from '../../../../shared/contracts/episodes.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

/** Which lens groups the Episodes list: season watch states or weekdays. */
export type EpisodeViewLens = 'season' | 'daily';

/** Props accepted by the operational episode schedule panel. */
export interface EpisodeSchedulePanelProps {
  /** Optional source for tests or non-Wails adapters. */
  readonly source?: EpisodeScheduleSource;
  /** Optional initial day; defaults to the current legacy weekday or season lens. */
  readonly initialDay?: string;
  /** Optional content between the Today title row and the day tabs, such as the open-season banner. */
  readonly banner?: ReactNode;
}

/**
 * Request/reply port used by the Episodes UI hook: the episodes module's two
 * reads (`EpisodesSource`, read through `useBridgeQuery`) plus the season probe,
 * covers and writes, which have not migrated yet. Live updates come from the
 * `anime.changed` invalidation rule, not from a subscription here.
 */
export interface EpisodeScheduleSource extends EpisodesSource {
  readonly getSeasonMode: () => Promise<boolean>;
  readonly adjustWatchedEpisodes: (animeID: string, delta: number, base: number) => Promise<EpisodeCommandResult>;
  readonly setAnimeState: (animeID: string, estado: number, base: number) => Promise<EpisodeCommandResult>;
  readonly openAnimePage: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly copyAnimePage: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly openAnimeFolder: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly copyAnimeFolder: (animeID: string) => Promise<EpisodeCommandResult>;
  readonly getAnimeCover: (animeID: string) => Promise<AnimeCover>;
}

/**
 * The view-ready Today chip of a row whose next episode runs long: the NEXT
 * episode number and whole minutes as one label, with the whole sentence as
 * its tooltip. Computed by the row mapper so the card stays dumb.
 */
export interface LongEpisodeChip {
  /** The chip text, e.g. `Ep. 7 · 45 min`. */
  readonly label: string;
  /** The tooltip sentence, e.g. `El próximo capítulo dura 45 minutos`. */
  readonly tooltip: string;
}

/** Cover resolution result for one anime, fetched lazily and cached per session. */
export interface AnimeCover {
  readonly dataUrl?: string;
  readonly source: 'cover' | 'placeholder';
}

/** The one state Today's schedule area renders (ADR-032 §4), its rows view-ready. */
export type EpisodeScheduleView = AsyncView<readonly EpisodeScheduleRow[]>;

/**
 * The message of the last rejected row write ('' once a later write cleared
 * it) and when it was raised (epoch ms): it shows until the schedule loads again.
 */
export interface EpisodeCommandFailure {
  readonly message: string;
  readonly raisedAt: number;
}

/** The part of the schedule query `toEpisodeScheduleView` reads. */
export interface EpisodeScheduleQueryState {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: readonly EpisodeScheduleItem[] | undefined;
  readonly error: unknown;
  readonly isFetching: boolean;
  /** True while a new day's key shows the previous day's rows. */
  readonly isPlaceholderData: boolean;
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
  /**
   * The long-episode chip to render beside the status chip, or undefined
   * when the row has no mark: no chip, no placeholder, no layout shift.
   */
  readonly longEpisodeChip?: LongEpisodeChip;
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

/**
 * Where the Today empty state's one action goes: the Create workspace when a
 * weekday has nothing scheduled, or Season, where a season section is filled.
 */
export type EpisodeEmptyStateAction = 'create' | 'season';

/** Contextual Today empty-state wording naming the day or lens that resolved empty. */
export interface EpisodeEmptyStateCopy {
  readonly title: string;
  readonly description: string;
  /** `waiting-on-step` when another screen fills the section; `first-run` when creating an anime does. */
  readonly kind: 'first-run' | 'waiting-on-step';
  /** Where the empty state's one action sends the user. */
  readonly action: EpisodeEmptyStateAction;
}

/** Collaborators the Today write commands need, and nothing more. */
export interface UseEpisodeProgressCommandsOptions {
  readonly source: EpisodeScheduleSource;
  /** Called with the message a rejected write should surface, or '' to clear it. */
  readonly onError: (message: string) => void;
  /** Called after an accepted write, to re-read whatever it may have moved. */
  readonly onCommitted: () => void;
}
