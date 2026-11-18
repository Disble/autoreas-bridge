import type { AnimeCoverSource } from '../../../../shared/anime-cover/anime-cover.types';

/**
 * What a season row's 44px cover slot renders: a resolved image source, a
 * pending lookup, or (neither) the shared placeholder. The slot never resolves
 * anything itself, so a caller decides where the source comes from.
 */
export interface SeasonCoverThumbProps {
  /** A renderable image source (a resolved data URL or a remote cover URL); absent means no cover. */
  readonly coverSrc: string | undefined;
  /** Whether the cover is still being resolved; ignored once a source exists. */
  readonly isLoading: boolean;
}

/**
 * The cover-resolution port a season list depends on: the shared
 * `AnimeCoverSource` (`getAnimeCover` of the anime module's port), so a test
 * injects a fake without the Wails singleton. Its absence degrades every row
 * to the placeholder instead of throwing.
 */
export type SeasonCoverSource = AnimeCoverSource;
