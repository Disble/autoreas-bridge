/** Props for the Episodes-card season grade action (primitive, feature-agnostic). */
export interface SeasonRateActionProps {
  /** The anime id shown on the Episodes card. */
  readonly animeId: string;
  /** The anime display name. */
  readonly rawName: string;
}
