import type { ReactNode } from 'react';

/**
 * A cover loaded straight from a remote URL, with what to show instead when
 * that URL fails to load. The image is decorative: the row it sits in already
 * names the anime.
 */
export interface RemoteCoverImageProps {
  /** The remote image URL. */
  readonly src: string;
  /** What replaces the image once it fails to load. */
  readonly fallback: ReactNode;
  /** Classes applied to the image. */
  readonly className?: string;
  /** The image's intrinsic width attribute, reserving its layout box. */
  readonly width?: number;
  /** The image's intrinsic height attribute, reserving its layout box. */
  readonly height?: number;
  /** The image's test id. */
  readonly 'data-testid'?: string;
}

/** Whether the current source failed to load, and the handler that records it. */
export interface UseRemoteCoverImageResult {
  /** True once the current `src` fired an error. */
  readonly hasFailed: boolean;
  /** Records the current `src` as failed; wire it to the image's `onError`. */
  readonly onError: () => void;
}
