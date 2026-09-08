import { cn, Skeleton } from '@heroui/react';
import { ANIME_EDITOR_LIST_ROW_CLASS, ANIME_EDITOR_SKELETON_ROW_COUNT } from './anime-editor-workspace.constants';

/**
 * Placeholder rows shown while the Editor Library's watching-first list
 * request is unresolved. Mirrors `AnimeEditorListRow`'s two-line shape and
 * shares its `min-h-14` geometry, so the rail does not jump once the real
 * rows arrive.
 */
export function AnimeEditorListSkeleton() {
  return (
    <>
      {Array.from({ length: ANIME_EDITOR_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div
          className={cn(ANIME_EDITOR_LIST_ROW_CLASS, 'flex items-center border-transparent bg-transparent')}
          data-testid="anime-editor-skeleton-row"
          key={index}
        >
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
