import type { SeasonSectionId } from '../SeasonWorkspace/season-workspace.types';

/** Props for the Evaluation panel's cross-section recovery action. */
export interface EvaluationPanelProps {
  /** Navigates to another season workflow section. */
  readonly onNavigate: (section: SeasonSectionId) => void;
}

/** One created season candidate as shown in the Evaluation progress list. */
export interface EvaluationRow {
  /** The season_anime row id (skip grading targets the row). */
  readonly id: string;
  /** The created anime id (grading targets the anime). */
  readonly animeId: string;
  /** Display name. */
  readonly rawName: string;
  /** First-episode grade (1–6); 0 means ungraded. */
  readonly grade: number;
  /** How the grade was captured ('mobile_sync' | 'manual' | ''). */
  readonly gradeSource: string;
  /** Epoch ms when the grade was recorded; absent until graded. */
  readonly ratedAt?: number;
  /** Explicit "no grade" override. */
  readonly skipGrading: boolean;
}

/** The chip a candidate's first-episode grade state renders: its label and semantic color. */
export interface GradeChip {
  /** "Grade N", "Skipped" or "No grade". */
  readonly label: string;
  /** success when graded, default when skipped, warning when still ungraded. */
  readonly color: 'success' | 'default' | 'warning';
}

/** One Evaluation list row as rendered: the candidate plus what its row shows. */
export interface EvaluationListItem {
  /** The candidate the row renders and its actions target. */
  readonly row: EvaluationRow;
  /** Still ungraded and not skipped: the row offers Rate and Skip. */
  readonly isPending: boolean;
  /** The muted line under the name: "Not rated yet", or the source and date. */
  readonly meta: string;
  /** The row's grade-state chip. */
  readonly chip: GradeChip;
}

/** Everything the Evaluation list derives from the season rows in one pass. */
export interface EvaluationView {
  /** The rows the list renders, ungraded first. */
  readonly items: readonly EvaluationListItem[];
  /** How many candidates are neither graded nor skipped. */
  readonly ungradedCount: number;
  /** The anime ids whose covers the list renders, in list order. */
  readonly animeIds: readonly string[];
}
