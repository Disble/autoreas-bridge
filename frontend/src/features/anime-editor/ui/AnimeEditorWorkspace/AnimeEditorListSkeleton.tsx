import { cn, Skeleton } from '@heroui/react';
import { ANIME_EDITOR_LIST_COVER_CLASS, ANIME_EDITOR_LIST_ROW_CLASS, ANIME_EDITOR_SKELETON_ROW_COUNT } from './anime-editor-workspace.constants';

/**
 * Placeholder rows shown while the Editor Library's watching-first list
 * request is unresolved. Mirrors `AnimeEditorListRow`'s cover-slot-plus-two-line
 * shape and shares its `min-h-14` geometry and cover-slot class, so the rail
 * does not jump once the real rows (and their covers) arrive.
 */
export function AnimeEditorListSkeleton() {
  return (
    <>
      {Array.from({ length: ANIME_EDITOR_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div
          className={cn(ANIME_EDITOR_LIST_ROW_CLASS, 'flex items-center gap-2 border-transparent bg-transparent')}
          data-testid="anime-editor-skeleton-row"
          key={index}
        >
          <Skeleton aria-hidden="true" className={ANIME_EDITOR_LIST_COVER_CLASS} data-testid="anime-editor-skeleton-cover" />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
