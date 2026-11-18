import type { Selection } from '@heroui/react';
import { useCallback, useState } from 'react';
import { toFilterGroupValues } from '../../../../shared/ui/FilterTagGroup/filter-tag-group.helpers';
import { countAnimeEditorFacets } from './anime-editor-list.helpers';
import { ANIME_EDITOR_NO_FACETS } from './anime-editor-workspace.constants';
import type { AnimeEditorFacets } from './anime-editor-workspace.types';

/**
 * Owns the Library rail's Status and Type filters: the picked values, their
 * count for the Filters button, and the group and reset callbacks.
 */
export function useAnimeEditorFacets() {
  // 1. Refs

  // 2. State
  const [facets, setFacets] = useState<AnimeEditorFacets>(ANIME_EDITOR_NO_FACETS);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State
  const activeFacetCount = countAnimeEditorFacets(facets);

  // 6. Callbacks
  const onStatusSelectionChange = useCallback(
    (selection: Selection) => setFacets((current) => ({ ...current, statuses: toFilterGroupValues(selection, current.statuses) })),
    [],
  );
  const onKindSelectionChange = useCallback(
    (selection: Selection) => setFacets((current) => ({ ...current, kinds: toFilterGroupValues(selection, current.kinds) })),
    [],
  );
  const onFacetsReset = useCallback(() => setFacets(ANIME_EDITOR_NO_FACETS), []);

  // 7. Effects

  return { facets, activeFacetCount, onStatusSelectionChange, onKindSelectionChange, onFacetsReset };
}
