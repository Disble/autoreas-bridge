import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { ANIME_EDITOR_LIST_INITIAL_COUNT, ANIME_EDITOR_LIST_LOAD_BATCH } from './anime-editor-workspace.constants';

/** Progressive rail rendering: starts at INITIAL_COUNT rows, appends a batch near the bottom. */
export function useAnimeEditorListWindow(itemCount: number, initialCount = ANIME_EDITOR_LIST_INITIAL_COUNT, batch = ANIME_EDITOR_LIST_LOAD_BATCH) {
  return useProgressiveListWindow(itemCount, initialCount, batch);
}
