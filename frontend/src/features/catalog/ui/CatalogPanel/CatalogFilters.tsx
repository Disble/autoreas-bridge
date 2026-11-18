import { Button, Separator } from '@heroui/react';
import { FilterTagGroup } from '../../../../shared/ui/FilterTagGroup/FilterTagGroup';
import { formatShowMatchesLabel, toFilterGroupKeys } from '../../../../shared/ui/FilterTagGroup/filter-tag-group.helpers';
import type { CatalogSectionProps } from './catalog-panel.types';
import { CATALOG_GENRES_HINT } from './catalog-panel.constants';

/** Status, Type and Genres tag groups, with reset and the "Show N anime" close action. */
export function CatalogFilters({ state }: Readonly<CatalogSectionProps>) {
  return (
    <div className="flex flex-col gap-3">
      <FilterTagGroup label="Status" options={state.statusOptions} selectedKeys={toFilterGroupKeys(state.criteria.statuses)} onSelectionChange={state.onStatusSelectionChange} />
      <Separator />
      <FilterTagGroup label="Type" options={state.kindOptions} selectedKeys={toFilterGroupKeys(state.criteria.kinds)} onSelectionChange={state.onKindSelectionChange} />
      <Separator />
      <FilterTagGroup hint={CATALOG_GENRES_HINT} label="Genres" options={state.genreOptions} selectedKeys={state.criteria.genres} onSelectionChange={state.onGenresSelectionChange} />
      <Separator />
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="tertiary" onPress={state.onFiltersReset}>Reset filters</Button>
        <Button size="sm" slot="close" variant="primary">{formatShowMatchesLabel(state.matchingCount)}</Button>
      </div>
    </div>
  );
}
