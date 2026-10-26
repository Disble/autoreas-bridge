import type { SeasonSectionId } from '../SeasonWorkspace/season-workspace.types';
import type { AnimeDesktopActionsProps } from '../../../../shared/ui/AnimeDesktopActions.types';
import type { SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';

/** Props for the Selection board's cross-section recovery action. */
export interface SelectionBoardProps {
  /** Navigates to another season workflow section. */
  readonly onNavigate: (section: SeasonSectionId) => void;
}

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

/** The view's sort modes: the board's own order, grade in either direction, or the title. */
export type SelectionSort = 'original' | 'grade-desc' | 'grade-asc' | 'name-asc' | 'name-desc';

/** The live filter and sort criteria of the Selection view; empty means unrestricted. */
export interface SelectionViewCriteria {
  /** Selected grade values ("0" is the ungraded None); empty means unrestricted. */
  readonly grades: readonly string[];
  /** Selected verdicts; empty means unrestricted. */
  readonly verdicts: readonly Verdict[];
  /** Selected consideration tokens; empty means unrestricted. */
  readonly considerations: readonly string[];
  /** The order applied inside each verdict group. */
  readonly sort: SelectionSort;
}

/** One option of the sort Select. */
export interface SelectionSortOption {
  /** The sort mode the Select stores. */
  readonly value: SelectionSort;
  /** The English label the Select shows. */
  readonly label: string;
}

/** The criteria field a filter group edits. */
export type SelectionFilterKey = 'grades' | 'verdicts' | 'considerations';

/** One selectable value of a filter group. */
export interface SelectionFilterOption {
  /** The value stored in the criteria field. */
  readonly value: string;
  /** The English label the tag shows. */
  readonly label: string;
}

/** One filter group: a label plus the values it can select. */
export interface SelectionFilterGroup {
  /** The criteria field this group edits. */
  readonly key: SelectionFilterKey;
  /** The English group label. */
  readonly label: string;
  /** The selectable values, in vocabulary order. */
  readonly options: readonly SelectionFilterOption[];
}

/** One line of the persistent criteria summary. */
export interface SelectionViewSummaryEntry {
  /** The dimension label. */
  readonly label: string;
  /** The selected labels in vocabulary order, or All while unrestricted. */
  readonly value: string;
}

/** The decision header's props: the season parameters, the quota status and their edits. */
export interface SelectionDecisionHeaderProps {
  /** Whether the season is closed: the steppers and the confirm action are disabled. */
  readonly readOnly: boolean;
  /** The current minimum approval grade. */
  readonly minApprovalGrade: number;
  /** The current slot cap. */
  readonly slots: number;
  /** How many candidates derive as approved. */
  readonly approvedCount: number;
  /** How many candidates derive as rejected. */
  readonly rejectedCount: number;
  /** The quota meter state against the slot cap. */
  readonly quota: QuotaStatus;
  /** When the selection was last confirmed, absent when it never was. */
  readonly selectionConfirmedAt?: number | null;
  /** Whether any candidate exists: the status chips and confirm only show with rows. */
  readonly hasRows: boolean;
  /** Stores a new minimum approval grade. */
  readonly onSetMinApprovalGrade: (grade: number) => void;
  /** Stores a new slot cap. */
  readonly onSetSlots: (slots: number) => void;
  /** Applies the reconciliation; rejected candidates become deactivated animes. */
  readonly onConfirm: () => void;
}

/** The list body's props: the visible groups, or the filtered empty state. */
export interface SelectionListBodyProps
  extends Pick<AnimeDesktopActionsProps, 'onOpenPage' | 'onCopyPage' | 'onOpenFolder' | 'onCopyFolder'> {
  /** Whether the season is closed: the consideration renders as text. */
  readonly readOnly: boolean;
  /** The visible groups, already filtered and sorted. */
  readonly groups: readonly SelectionGroup[];
  /** How many rows each verdict group holds before filtering. */
  readonly groupTotals: Readonly<Record<Verdict, number>>;
  /** How many candidates the criteria keep. */
  readonly matchingCount: number;
  /** How many candidates exist before filtering. */
  readonly totalCount: number;
  /** Resolves one candidate's cover thumbnail. */
  readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps;
  /** Clears the criteria and restores the current order. */
  readonly onResetView: () => void;
  /** Stores a new consideration token for a season_anime row. */
  readonly onSetConsideration: (rowId: string, consideration: string) => void;
}

/** The candidate card's props: the filter toolbar and the list body it narrows. */
export interface SelectionCandidateListProps {
  /** Everything the filter toolbar renders and reports. */
  readonly toolbar: SelectionFilterToolbarProps;
  /** Everything the list body renders and reports. */
  readonly body: SelectionListBodyProps;
}

/** What the filter toolbar renders and the view changes it reports. */
export interface SelectionFilterToolbarProps {
  /** The live view criteria. */
  readonly criteria: SelectionViewCriteria;
  /** The three dimensions and their values. */
  readonly groups: readonly SelectionFilterGroup[];
  /** The sort Select's options. */
  readonly sortOptions: readonly SelectionSortOption[];
  /** The persistent summary, one entry per dimension. */
  readonly summaryOptions: readonly SelectionViewSummaryEntry[];
  /** How many values are selected across the dimensions. */
  readonly activeFilterCount: number;
  /** How many candidates the criteria keep. */
  readonly matchingCount: number;
  /** How many candidates exist before filtering. */
  readonly totalCount: number;
  /** Applies one dimension's selected values; an empty list makes it unrestricted. */
  readonly onGroupChange: (key: SelectionFilterKey, values: readonly string[]) => void;
  /** Clears the three dimensions and restores the current order. */
  readonly onResetView: () => void;
  /** Clears the three dimensions but keeps the current sort mode. */
  readonly onResetFilters: () => void;
  /** Applies a sort mode. */
  readonly onSortChange: (sort: SelectionSort) => void;
}
