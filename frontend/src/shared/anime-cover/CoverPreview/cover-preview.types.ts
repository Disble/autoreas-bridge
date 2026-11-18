import type { AnimeCoverPreviewSource } from '../../contracts/anime-source.types';
import type { AnimeCoverEntry } from '../use-anime-cover';

/** Props for the small preview of an unsaved cover value beside a cover field. */
export interface CoverPreviewProps {
  /** The cover value the form holds now: a local image path or an image URL. */
  readonly value: string;
  /** The anime module's port that renders the value. */
  readonly source: AnimeCoverPreviewSource;
}

/**
 * What the preview shows: a cover entry (loading, the rendered cover, or the
 * placeholder for a value that renders no cover), or the failure of the read
 * itself, which is never shown as "no cover".
 */
export type CoverPreviewState = AnimeCoverEntry | { readonly status: 'failure'; readonly message: string };
