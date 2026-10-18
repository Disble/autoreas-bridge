import { useCallback, useState } from 'react';
import type { UseRemoteCoverImageResult } from './remote-cover-image.types';

/**
 * Tracks whether a remote cover failed to load, so the caller can show its
 * fallback instead of the browser's broken-image glyph. Remote covers fail for
 * reasons outside the app (a CDN answering 504 is the measured case), and the
 * glyph reads as an app defect.
 *
 * The failure is recorded against the source it happened to, so a different
 * `src` gets its own attempt without an effect resetting state.
 * @param src The remote image URL currently rendered.
 * @returns Whether `src` failed, and the error handler to wire to the image.
 */
export function useRemoteCoverImage(src: string): UseRemoteCoverImageResult {
  // 1. Refs

  // 2. State
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State
  const hasFailed = failedSrc === src;

  // 6. Callbacks
  const onError = useCallback(() => {
    setFailedSrc(src);
  }, [src]);

  // 7. Effects

  return { hasFailed, onError };
}
