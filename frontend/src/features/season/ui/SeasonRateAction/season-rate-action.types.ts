/** Props for the Chapters-card season grade action (primitive, feature-agnostic). */
export interface SeasonRateActionProps {
  /** The anime id shown on the Chapters card. */
  readonly animeId: string;
  /** The anime display name. */
  readonly rawName: string;
}
