import type { RemoteCoverImageProps } from './remote-cover-image.types';
import { useRemoteCoverImage } from './use-remote-cover-image';

/**
 * A decorative cover image loaded from a remote URL that degrades to the
 * caller's fallback when the URL fails to load, never to the browser's
 * broken-image glyph.
 */
export function RemoteCoverImage({ src, fallback, ...imageProps }: Readonly<RemoteCoverImageProps>) {
  const { hasFailed, onError } = useRemoteCoverImage(src);

  if (hasFailed) {
    return <>{fallback}</>;
  }
  return <img alt="" {...imageProps} src={src} onError={onError} />;
}
