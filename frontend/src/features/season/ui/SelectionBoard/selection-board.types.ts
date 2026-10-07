import type { AnimeDesktopActionsProps } from '../../../../shared/ui/AnimeDesktopActions.types';
import type { SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';

/** A verdict token, mirrored from the Go domain (never stored, always derived). */
export type Verdict = 'approved' | 'rejected';

/** The quota meter state relative to the slot cap. */
export type QuotaStatus = 'under' | 'at' | 'over';

/** One created candidate row as shown in the selection table. */
export interface SelectionRow {
  /** The season_anime row id (consideration edits target the row). */
  readonly id: string;
  /** The created anime id. */
  readonly animeId: string;
  /** Display name. */
  readonly rawName: string;
  /** First-episode grade (1–6); 0 means ungraded. */
  readonly grade: number;
  /** Selection override token. */
  readonly consideration: string;
  /** The live-derived verdict. */
  readonly verdict: Verdict;
  /** The created anime's download folder path, empty when absent. */
  readonly folderPath: string;
  /** The created anime's source page URL, empty when absent. */
  readonly pageUrl: string;
  /** Whether the folder desktop action should render. */
  readonly hasFolder: boolean;
  /** Whether the page desktop action should render. */
  readonly hasPage: boolean;
}

/** One option in the consideration Select. */
export interface ConsiderationOption {
  /** The consideration token the Select stores. */
  readonly value: string;
  /** The English label the Select shows. */
  readonly label: string;
}

/** What one candidate row of the selection list renders and the edits it offers. */
export interface SelectionCandidateRowProps
  extends Pick<AnimeDesktopActionsProps, 'onOpenPage' | 'onCopyPage' | 'onOpenFolder' | 'onCopyFolder'> {
  /** The candidate. */
  readonly row: SelectionRow;
  /** Whether the season is closed: the consideration shows as text instead of a select. */
  readonly readOnly: boolean;
  /** The candidate's cover thumbnail. */
  readonly coverThumb: SeasonCoverThumbProps;
  /** Stores a new consideration token for a season_anime row. */
  readonly onSetConsideration: (rowId: string, consideration: string) => void;
}

/** The HeroUI Chip color the quota meter renders for a quota status. */
export type QuotaColor = 'danger' | 'warning' | 'success';

/** One verdict group of the candidate list: its rows keep the board's order. */
export interface SelectionGroup {
  /** The verdict every row in the group derives. */
  readonly verdict: Verdict;
  /** The group's English heading. */
  readonly label: string;
  /** The group's rows, in board order. */
  readonly rows: readonly SelectionRow[];
}
