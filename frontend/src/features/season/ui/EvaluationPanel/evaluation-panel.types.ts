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
