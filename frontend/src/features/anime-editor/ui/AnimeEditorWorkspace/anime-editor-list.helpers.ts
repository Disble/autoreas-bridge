import type { Anime } from '../../../../shared/contracts/anime.types';
import { matchesFilterGroup } from '../../../../shared/ui/FilterTagGroup/filter-tag-group.helpers';
import type { AnimeEditorFacets, AnimeEditorFilter, AnimeEditorListLoadingInput } from './anime-editor-workspace.types';

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

/**
 * Whether an anime passes the rail's Status and Type filters: each group with
 * a picked value keeps only the anime carrying one of them.
 * @param anime The catalog row.
 * @param facets The picked Status and Type values.
 * @returns True when the row stays in the rail.
 */
export function matchesAnimeEditorFacets(anime: Anime, facets: AnimeEditorFacets): boolean {
  return matchesFilterGroup(facets.statuses, anime.status) && matchesFilterGroup(facets.kinds, anime.kind);
}

/**
 * How many Status and Type values narrow the rail.
 * @param facets The picked Status and Type values.
 * @returns The count the Filters button shows.
 */
export function countAnimeEditorFacets(facets: AnimeEditorFacets): number {
  return facets.statuses.length + facets.kinds.length;
}

/**
 * Whether anything the user could clear narrows the rail: a search, the
 * Watching now lens, or a picked Status or Type.
 * @param query The search text.
 * @param filter The rail lens.
 * @param facets The picked Status and Type values.
 * @returns True when "Clear search and filters" would bring rows back.
 */
export function hasActiveAnimeEditorCriteria(query: string, filter: AnimeEditorFilter, facets: AnimeEditorFacets): boolean {
  return query.trim().length > 0 || filter !== 'all' || countAnimeEditorFacets(facets) > 0;
}
