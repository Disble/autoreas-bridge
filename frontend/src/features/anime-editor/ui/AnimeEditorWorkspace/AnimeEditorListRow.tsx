import { Button, cn, Typography } from '@heroui/react';
import { ANIME_EDITOR_LIST_ROW_CLASS } from './anime-editor-workspace.constants';
import type { AnimeEditorListRowProps } from './anime-editor-workspace.types';

/**
 * One row of the Editor Library's watching-first rail: name, subtitle, and
 * selected-state styling. Extracted from `AnimeEditorListPanel` so
 * `AnimeEditorListSkeleton` has a real row to mirror and measure against.
 */
export function AnimeEditorListRow({ item, onSelectAnime }: Readonly<AnimeEditorListRowProps>) {
  return (
    <Button
      className={cn(
        ANIME_EDITOR_LIST_ROW_CLASS,
        item.selected ? 'border-accent bg-accent/10' : 'border-transparent bg-transparent hover:bg-white/[0.04]',
      )}
      variant="tertiary"
      onPress={() => onSelectAnime(item.animeId)}
    >
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        <Typography className="whitespace-normal break-words" type="body-sm" weight="semibold">{item.nombre}</Typography>
        <Typography color="muted" truncate type="body-xs">{item.subtitle}</Typography>
      </div>
    </Button>
  );
}
