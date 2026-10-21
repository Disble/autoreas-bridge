import { useCallback } from 'react';
import { useStore } from 'zustand';
import { CATALOG_DEFAULT_CRITERIA } from './catalog-panel.constants';
import type { Key, Selection } from '@heroui/react';
import {
  removeCatalogCriterionChips,
  toCatalogCriterionChips,
  toCatalogGenres,
  toCatalogGroupValues,
  toCatalogSortKey,
  toCatalogView,
} from './catalog-panel.helpers';
import type { CatalogCriteria, UseCatalogCriteriaResult } from './catalog-panel.types';
import { catalogSessionStore } from './catalog-session.store';

/**
 * Owns the Catalog search, filters, sort and view. They live in the session
 * store rather than component state so returning from an anime detail restores
 * them (S11).
 */
export function useCatalogCriteria(): UseCatalogCriteriaResult {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const criteria = useStore(catalogSessionStore, (state) => state.criteria);
  const sort = useStore(catalogSessionStore, (state) => state.sort);
  const view = useStore(catalogSessionStore, (state) => state.view);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const updateCriteria = useCallback((update: (previous: CatalogCriteria) => CatalogCriteria) => {
    catalogSessionStore.setState((state) => ({ criteria: update(state.criteria) }));
  }, []);
  const onQueryChange = useCallback((query: string) => updateCriteria((previous) => ({ ...previous, query })), [updateCriteria]);
  const onStatusSelectionChange = useCallback(
    (selection: Selection) => updateCriteria((previous) => ({ ...previous, statuses: toCatalogGroupValues(selection, previous.statuses) })),
    [updateCriteria],
  );
  const onKindSelectionChange = useCallback(
    (selection: Selection) => updateCriteria((previous) => ({ ...previous, kinds: toCatalogGroupValues(selection, previous.kinds) })),
    [updateCriteria],
  );
  const onGenresSelectionChange = useCallback(
    (selection: Selection) => updateCriteria((previous) => ({ ...previous, genres: toCatalogGenres(selection, previous.genres) })),
    [updateCriteria],
  );
  const onCriterionChipsRemove = useCallback(
    (chipIds: Iterable<string | number>) =>
      updateCriteria((previous) => removeCatalogCriterionChips(previous, toCatalogCriterionChips(previous), chipIds)),
    [updateCriteria],
  );
  const onFiltersReset = useCallback(
    () => updateCriteria((previous) => ({ ...CATALOG_DEFAULT_CRITERIA, query: previous.query })),
    [updateCriteria],
  );
  const onClearCriteria = useCallback(() => updateCriteria(() => CATALOG_DEFAULT_CRITERIA), [updateCriteria]);
  const onSortChange = useCallback((key: Key | null) => {
    catalogSessionStore.setState((state) => ({ sort: toCatalogSortKey(key, state.sort) }));
  }, []);
  const onViewSelectionChange = useCallback((selection: Selection) => {
    catalogSessionStore.setState((state) => ({ view: toCatalogView(selection, state.view) }));
  }, []);

  // 7. Effects

  return {
    criteria,
    sort,
    view,
    onQueryChange,
    onStatusSelectionChange,
    onKindSelectionChange,
    onGenresSelectionChange,
    onCriterionChipsRemove,
    onSortChange,
    onViewSelectionChange,
    onFiltersReset,
    onClearCriteria,
  };
}
