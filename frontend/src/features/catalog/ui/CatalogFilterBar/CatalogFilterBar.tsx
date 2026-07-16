import { Input } from '@heroui/react';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import type { CatalogFilterBarProps } from './catalog-filter-bar.types';

/**
 * Renders the search box and advanced filter controls for the anime catalog.
 * All state and callbacks are controlled by the parent hook.
 */
export function CatalogFilterBar(props: Readonly<CatalogFilterBarProps>) {
  const {
    filters,
    estadoOptions,
    activoOptions,
    tipoOptions,
    diaOptions,
    generoOptions,
    gapOptions,
    onQueryChange,
    onEstadoChange,
    onActivoChange,
    onTipoChange,
    onDiaChange,
    onGenerosChange,
    onGapChange,
  } = props;

  return (
    <section aria-label="Anime filters" className="flex flex-col gap-3">
      <Input
        aria-label="Search animes"
        className="w-full"
        placeholder="Search by name..."
        type="search"
        value={filters.query}
        variant="secondary"
        onChange={(event) => onQueryChange(event.target.value)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledSelect
          ariaLabel="Filter by status"
          fallbackValue="all"
          label="Status"
          options={estadoOptions}
          placeholder="Status"
          variant="secondary"
          value={filters.estado}
          onChange={onEstadoChange}
        />

        <LabeledSelect
          ariaLabel="Filter by active state"
          fallbackValue="all"
          label="Active"
          options={activoOptions}
          placeholder="Active"
          variant="secondary"
          value={filters.activo}
          onChange={onActivoChange}
        />

        <LabeledSelect
          ariaLabel="Filter by type"
          fallbackValue="all"
          label="Type"
          options={tipoOptions}
          placeholder="Type"
          variant="secondary"
          value={filters.tipo}
          onChange={onTipoChange}
        />

        <LabeledSelect
          ariaLabel="Filter by day"
          fallbackValue="all"
          label="Day"
          options={diaOptions}
          placeholder="Day"
          variant="secondary"
          value={filters.dia}
          onChange={onDiaChange}
        />

        <LabeledSelect
          ariaLabel="Filter by download gap"
          fallbackValue="all"
          label="Download gap"
          options={gapOptions}
          placeholder="Download gap"
          variant="secondary"
          value={filters.gap}
          onChange={onGapChange}
        />
      </div>

      <LabeledSelect
        ariaLabel="Filter by genres"
        className="w-full"
        label="Genres"
        options={generoOptions}
        placeholder="Genres"
        selectionMode="multiple"
        variant="secondary"
        value={filters.generos}
        onChange={onGenerosChange}
      />
    </section>
  );
}
