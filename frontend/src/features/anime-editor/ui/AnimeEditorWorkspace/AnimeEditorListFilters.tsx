import { Button, Separator } from '@heroui/react';
import { ANIME_KIND_FILTER_OPTIONS, ANIME_STATUS_FILTER_OPTIONS } from '../../../../shared/constants/anime-filter.constants';
import { FilterTagGroup } from '../../../../shared/ui/FilterTagGroup/FilterTagGroup';
import { FiltersPopover } from '../../../../shared/ui/FilterTagGroup/FiltersPopover';
import { formatShowMatchesLabel, toFilterGroupKeys } from '../../../../shared/ui/FilterTagGroup/filter-tag-group.helpers';
import type { AnimeEditorListPanelProps } from './anime-editor-workspace.types';

/** The Library rail's Filters button and popover: the Status and Type groups, a reset and the "Show N anime" close action. */
export function AnimeEditorListFilters({ viewModel }: Readonly<AnimeEditorListPanelProps>) {
  return (
    <FiltersPopover activeFilterCount={viewModel.activeFacetCount}>
      <div className="flex flex-col gap-3">
        <FilterTagGroup label="Status" options={ANIME_STATUS_FILTER_OPTIONS} selectedKeys={toFilterGroupKeys(viewModel.facets.statuses)} onSelectionChange={viewModel.onStatusSelectionChange} />
        <Separator />
        <FilterTagGroup label="Type" options={ANIME_KIND_FILTER_OPTIONS} selectedKeys={toFilterGroupKeys(viewModel.facets.kinds)} onSelectionChange={viewModel.onKindSelectionChange} />
        <Separator />
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="tertiary" onPress={viewModel.onFacetsReset}>Reset filters</Button>
          <Button size="sm" slot="close" variant="primary">{formatShowMatchesLabel(viewModel.items.length)}</Button>
        </div>
      </div>
    </FiltersPopover>
  );
}
