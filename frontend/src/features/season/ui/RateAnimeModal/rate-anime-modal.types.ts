/** Props for the shared grade-capture modal (Episodes card + Evaluation panel). */
export interface RateAnimeModalProps {
  /** Legacy anime id the grade is recorded against. */
  readonly animeId: string;
  /** Display name shown in the modal header. */
  readonly rawName: string;
  /** Current grade (1–6), or 0 when ungraded; preselects the matching option. */
  readonly currentGrade: number;
  /** How the current grade was captured ('mobile_sync' | 'manual' | ''). */
  readonly gradeSource: string;
  /** How the trigger renders; defaults to 'grade' (the Episodes card's button). */
  readonly triggerVariant?: RateAnimeModalTriggerVariant;
}

/**
 * The trigger that opens the grade modal: 'grade' is a tertiary button showing
 * "Rate" or the current grade, 'rate' is a secondary "Rate" button for an
 * ungraded row, and 'icon' is a round tertiary star for changing a grade.
 */
export type RateAnimeModalTriggerVariant = 'grade' | 'rate' | 'icon';

/** Inputs of the button that opens the grade modal. */
export interface RateAnimeModalTriggerProps {
  /** Which trigger renders; omitted means 'grade' (the Episodes card's button). */
  readonly variant?: RateAnimeModalTriggerVariant;
  /** Display name, used in the trigger's accessible name. */
  readonly rawName: string;
  /** Current grade (1–6), or 0 when ungraded; the 'grade' variant shows it. */
  readonly currentGrade: number;
}
