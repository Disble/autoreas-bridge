import { Skeleton } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../../shared/ui/AnimeCoverPlaceholder';
import { ANIME_EDITOR_HEADER_COVER_CLASS, ANIME_EDITOR_HEADER_COVER_LOADING_LABEL } from './anime-editor-workspace.constants';
import type { AnimeEditorHeaderCoverProps } from './anime-editor-workspace.types';

/**
 * The selected record's SAVED cover in the editor form header: the pending
 * skeleton, the resolved image, or the shared cover placeholder. Extracted from
 * `AnimeEditorFormPanel` so the panel's own branch count stays within the
 * pre-commit `dharness check` complexity gate.
 *
 * Deliberately not the draft's cover fields: a live preview of an unsaved
 * source is out of scope, and the resolved entry only ever carries the
 * binding's data URL. The slot is fixed-size with the art filling it, so a
 * cover's own aspect ratio can never change the header's height.
 *
 * The slot draws nothing until a record is loaded: an absent `animeId` means
 * no anime is selected, which also makes the slot the single owner of that
 * gate so the panel carries no cover branch of its own.
 */
export function AnimeEditorHeaderCover({ animeId, cover, onCoverImageError }: Readonly<AnimeEditorHeaderCoverProps>) {
  if (animeId === undefined) {
    return null;
  }

  return (
    <div className={ANIME_EDITOR_HEADER_COVER_CLASS} data-testid="anime-editor-header-cover">
      {cover.status === 'loading' ? (
        <div aria-labelledby="anime-editor-header-cover-loading-label" aria-live="polite" className="size-full" role="status">
          <span className="sr-only" id="anime-editor-header-cover-loading-label">{ANIME_EDITOR_HEADER_COVER_LOADING_LABEL}</span>
          <Skeleton aria-hidden="true" className="size-full" />
        </div>
      ) : cover.status === 'cover' ? (
        <img
          alt=""
          className="size-full object-cover"
          data-testid="anime-editor-header-cover-image"
          src={cover.dataUrl}
          onError={() => onCoverImageError(animeId)}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-white/[0.04] text-muted" data-testid="anime-editor-header-cover-placeholder">
          <AnimeCoverPlaceholder className="size-9" />
        </div>
      )}
    </div>
  );
}
