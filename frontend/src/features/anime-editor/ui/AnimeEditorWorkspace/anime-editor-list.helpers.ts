import type { AnimeEditorListLoadingInput } from './anime-editor-workspace.types';

/**
 * Whether the Editor rail shows its skeleton: a read with no catalog yet, or the
 * Editor's own reload, so a row it just moved never lingers. A background refetch
 * (an anime.changed from another writer) keeps the loaded rail mounted, with its
 * scroll position.
 * @param input The catalog query's state and the Editor's reload flag.
 * @returns True while the rail shows its skeleton.
 */
export function isAnimeEditorListLoading(input: AnimeEditorListLoadingInput): boolean {
  return input.isPending || input.isReloading || (input.isFetching && !input.hasCatalog);
}
