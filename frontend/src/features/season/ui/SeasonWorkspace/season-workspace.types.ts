import type { SeasonQuerySource, SeasonSnapshot } from '../../../../shared/contracts/season.types';
import type { SeasonStoreState } from '../../../../shared/store/season-store/season-store.types';

/** Section identifiers for the Season Workspace tab shell. */
export type SeasonSectionId = 'overview' | 'intake' | 'daily' | 'evaluation' | 'selection' | 'ordering';

/** Season store UI state consumed by the Season Workspace: the shared banner and the read-only view flag. */
export type SeasonWorkspaceStoreBindings = Pick<SeasonStoreState, 'errorMessage' | 'readOnly'>;

/** Inputs of the hook that loads the open season's animes for the workspace gate. */
export interface SeasonWorkspaceAnimesLoadParams {
  /** The season the workspace shows; null when none is open. */
  readonly season: SeasonStoreState['season'];
  /** Whether a past season is being viewed read-only. */
  readonly readOnly: boolean;
  /** Season port the load goes through. */
  readonly source: SeasonQuerySource;
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

/** The Season Workspace reads: the displayed season, whether the screen still waits, and the history. */
export interface SeasonWorkspaceReads {
  /** The displayed season, or null when none is open. */
  readonly season: SeasonSnapshot | null;
  /** Whether the season, or an open live season's rows, are still unresolved. */
  readonly isLoading: boolean;
  /** The past-seasons history, once read. */
  readonly pastSeasons: readonly SeasonSnapshot[] | undefined;
}
