/** Props for the shared grade-capture modal (Chapters card + Evaluation panel). */
export interface RateAnimeModalProps {
  /** Legacy anime id the grade is recorded against. */
  readonly animeId: string;
  /** Display name shown in the modal header. */
  readonly rawName: string;
  /** Current grade (1–6), or 0 when ungraded; preselects the matching option. */
  readonly currentGrade: number;
  /** How the current grade was captured ('mobile_sync' | 'manual' | ''). */
  readonly gradeSource: string;
}
