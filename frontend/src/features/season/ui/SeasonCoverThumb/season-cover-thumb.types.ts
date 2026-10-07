/**
 * What a season row's 44px cover slot renders: a resolved image source, a
 * pending lookup, or (neither) the shared placeholder. The slot never resolves
 * anything itself, so a caller decides where the source comes from.
 */
export interface SeasonCoverThumbProps {
  /** A renderable image source (a resolved data URL); absent means no cover. */
  readonly coverSrc: string | undefined;
  /** Whether the cover is still being resolved; ignored once a source exists. */
  readonly isLoading: boolean;
}
