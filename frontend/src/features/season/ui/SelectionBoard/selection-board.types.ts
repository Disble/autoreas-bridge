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
}

/** One option in the consideration Select. */
export interface ConsiderationOption {
  readonly value: string;
  readonly label: string;
}
