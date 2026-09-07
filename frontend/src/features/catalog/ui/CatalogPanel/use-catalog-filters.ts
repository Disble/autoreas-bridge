import { useCallback, useState } from 'react';
import { CATALOG_DEFAULT_FILTERS } from './catalog-panel.constants';
import type { AnimeFilterState, UseCatalogFiltersResult } from './catalog-panel.types';

/**
 * Owns the Catalog filter controls and the reset that restores their
 * all-records default.
 *
 * Split out of `useCatalogPanel` because seven near-identical setters read as
 * one repeated block rather than seven decisions: the duplication gate found
 * three instances of the same six lines, and the panel hook's cognitive score
 * was mostly this. One generic field setter carries the update; each control
 * callback is now just the field it owns.
 */
export function useCatalogFilters(): UseCatalogFiltersResult {
  // 1. Refs

  // 2. State
  const [filters, setFilters] = useState<AnimeFilterState>(CATALOG_DEFAULT_FILTERS);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const setField = useCallback(<TField extends keyof AnimeFilterState>(field: TField, value: AnimeFilterState[TField]) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  }, []);
  const onQueryChange = useCallback((query: string) => setField('query', query), [setField]);
  const onEstadoChange = useCallback((estado: string) => setField('estado', estado), [setField]);
  const onActivoChange = useCallback((activo: string) => setField('activo', activo), [setField]);
  const onTipoChange = useCallback((tipo: string) => setField('tipo', tipo), [setField]);
  const onDiaChange = useCallback((dia: string) => setField('dia', dia), [setField]);
  const onGapChange = useCallback((gap: string) => setField('gap', gap), [setField]);
  const onGenerosChange = useCallback((values: readonly (string | number)[]) => {
    setField('generos', values.map((value) => (typeof value === 'number' ? String(value) : value)));
  }, [setField]);
  const onClearCriteria = useCallback(() => setFilters(CATALOG_DEFAULT_FILTERS), []);

  // 7. Effects

  return { filters, onQueryChange, onEstadoChange, onActivoChange, onTipoChange, onDiaChange, onGenerosChange, onGapChange, onClearCriteria };
}
