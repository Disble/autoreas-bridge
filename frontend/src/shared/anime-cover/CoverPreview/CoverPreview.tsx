import { Skeleton } from '@heroui/react';
import { useId } from 'react';
import { NoCoverPoster } from '../NoCoverPoster/NoCoverPoster';
import { useRemoteCoverImage } from '../RemoteCoverImage/use-remote-cover-image';
import { COVER_PREVIEW_FRAME_CLASS, COVER_PREVIEW_LABEL, COVER_PREVIEW_LOADING_LABEL, COVER_PREVIEW_NO_COVER_LABEL } from './cover-preview.constants';
import type { CoverPreviewProps } from './cover-preview.types';
import { useCoverPreview } from './use-cover-preview';

/**
 * A small 5:7 thumbnail of the cover a form holds before it is saved: a
 * shape-matching skeleton while it renders, the cover once it does, and the
 * No Cover poster for a value that renders nothing or an image that fails to
 * decode. The three states never coexist.
 */
export function CoverPreview({ value, source }: Readonly<CoverPreviewProps>) {
  const loadingLabelId = useId();
  const preview = useCoverPreview(value, source);
  // Stryker disable StringLiteral: equivalent: any key works for the non-cover states, since only a change of key between two covers resets a failed decode.
  const dataUrl = preview.status === 'cover' ? preview.dataUrl : '';
  // Stryker restore StringLiteral
  const { hasFailed, onError } = useRemoteCoverImage(dataUrl);

  if (preview.status === 'loading') {
    return (
      <div aria-labelledby={loadingLabelId} aria-live="polite" className={COVER_PREVIEW_FRAME_CLASS} role="status">
        <span className="sr-only" id={loadingLabelId}>{COVER_PREVIEW_LOADING_LABEL}</span>
        <Skeleton className="size-full rounded-lg" />
      </div>
    );
  }
  return (
    <div className={COVER_PREVIEW_FRAME_CLASS}>
      {preview.status === 'cover' && !hasFailed ? (
        <img alt={COVER_PREVIEW_LABEL} className="size-full object-cover" decoding="async" src={preview.dataUrl} onError={onError} />
      ) : (
        <NoCoverPoster label={COVER_PREVIEW_NO_COVER_LABEL} showLabel={false} />
      )}
    </div>
  );
}
