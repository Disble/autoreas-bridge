import { Button, cn, Skeleton, Typography } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../../shared/ui/AnimeCoverPlaceholder';
import { ANIME_EDITOR_LIST_COVER_CLASS, ANIME_EDITOR_LIST_ROW_CLASS } from './anime-editor-workspace.constants';
import type { AnimeEditorListRowProps } from './anime-editor-workspace.types';

/**
 * One row of the Editor Library's watching-first rail: the saved cover (or its
 * placeholder) beside the name, subtitle, and selected-state styling.
 * Extracted from `AnimeEditorListPanel` so `AnimeEditorListSkeleton` has a real
 * row to mirror and measure against.
 *
 * The row renders only the entry the rail's cover cache resolved -- an id and a
 * base64 data URL, never a stored path -- so a local Windows cover path
 * structurally cannot reach this image element. The slot is fixed-size, so a
 * cover's own aspect ratio cannot change the row's height.
 */
export function AnimeEditorListRow({ item, onCoverImageError, onSelectAnime }: Readonly<AnimeEditorListRowProps>) {
  return (
    <Button
      className={cn(
        ANIME_EDITOR_LIST_ROW_CLASS,
        item.selected ? 'border-accent bg-accent/10' : 'border-transparent bg-transparent hover:bg-white/[0.04]',
      )}
      variant="tertiary"
      onPress={() => onSelectAnime(item.animeId)}
    >
      <div className={ANIME_EDITOR_LIST_COVER_CLASS}>
        {item.cover.status === 'cover' ? (
          <img
            alt=""
            className="size-full object-cover"
            data-testid="anime-editor-list-cover-image"
            src={item.cover.dataUrl}
            onError={() => onCoverImageError(item.animeId)}
          />
        ) : item.cover.status === 'loading' ? (
          // Decorative: the rail's own status region already announces the list's
          // pending state, and one live region per row would repeat it 20 times.
          <Skeleton aria-hidden="true" className="size-full" data-testid="anime-editor-list-cover-loading" />
        ) : (
          <AnimeCoverPlaceholder aria-hidden="true" className="size-full text-muted" data-testid="anime-editor-list-cover-placeholder" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <Typography className="whitespace-normal break-words" type="body-sm" weight="semibold">{item.nombre}</Typography>
        <Typography color="muted" truncate type="body-xs">{item.subtitle}</Typography>
      </div>
    </Button>
  );
}
