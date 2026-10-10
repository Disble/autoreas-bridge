import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonStoreState } from '../../../../shared/store/season-store/season-store.types';

/** Section identifiers for the Season Workspace tab shell. */
export type SeasonSectionId = 'overview' | 'intake' | 'daily' | 'evaluation' | 'selection' | 'ordering';

/** Season store values and actions consumed by the Season Workspace. */
export type SeasonWorkspaceStoreBindings = Pick<
  SeasonStoreState,
  | 'season'
  | 'hasLoaded'
  | 'animesLoadState'
  | 'errorMessage'
  | 'readOnly'
  | 'pastSeasons'
  | 'refresh'
  | 'ensureAnimesLoaded'
  | 'createSeason'
  | 'closeSeason'
  | 'loadPastSeasons'
  | 'viewPastSeason'
  | 'exitPastSeason'
>;

/** Inputs of the hook that loads the open season's animes for the workspace gate. */
export interface SeasonWorkspaceAnimesLoadParams {
  /** The season the store currently holds. */
  readonly season: SeasonStoreState['season'];
  /** Whether a past season is being viewed read-only. */
  readonly readOnly: boolean;
  /** Request state of the season's animes. */
  readonly animesLoadState: SeasonStoreState['animesLoadState'];
  /** Store action that loads the animes once. */
  readonly ensureAnimesLoaded: SeasonStoreState['ensureAnimesLoaded'];
  /** Season port the load goes through. */
  readonly source: SeasonSource;
}

/** Derived view model for the Overview section of a season. */
export interface SeasonOverview {
  /** The season's name. */
  readonly title: string;
  /** Visible status chip label. */
  readonly statusLabel: string;
  /** Status chip color. */
  readonly statusColor: 'success' | 'default';
  /** Created-date label; empty when unknown. */
  readonly createdLabel: string;
  /** Minimum approval grade. */
  readonly minApprovalGrade: number;
  /** Approved-anime slots. */
  readonly slots: number;
}

/** One row in the past-seasons history list (shown when no season is open). */
export interface PastSeasonEntry {
  /** The season's id. */
  readonly id: string;
  /** The season's name. */
  readonly name: string;
  /** Visible status chip label. */
  readonly statusLabel: string;
  /** Status chip color. */
  readonly statusColor: 'success' | 'default';
  /** Created-date label; empty when unknown. */
  readonly createdLabel: string;
}

/** Props for the SeasonWorkspace panel; all data flows through its hook. */
export interface SeasonWorkspaceProps {
  /** Extra classes on the panel's root section. */
  readonly className?: string;
}

/** Props for the open season's Overview season card. */
export interface SeasonOverviewCardProps {
  /** The open season's facts. */
  readonly overview: SeasonOverview;
  /** Closes the season, which turns season mode off. */
  readonly onCloseSeason: () => void;
}
