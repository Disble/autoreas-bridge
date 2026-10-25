import type { CoverPreviewSource } from '../anime-cover.types';

/** Props for the small preview of an unsaved cover value beside a cover field. */
export interface CoverPreviewProps {
  /** The cover value the form holds now: a local image path or an image URL. */
  readonly value: string;
  /** The port that renders the value. */
  readonly source: CoverPreviewSource;
}
