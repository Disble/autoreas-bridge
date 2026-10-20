import checkIcon from '@iconify-icons/tabler/check';
import { Icon } from '@iconify/react';
import { Button, Description, Label, Separator, Tag, TagGroup } from '@heroui/react';
import type { CatalogFilterGroupProps, CatalogSectionProps } from './catalog-panel.types';
import { CATALOG_GENRES_HINT } from './catalog-panel.constants';
import { formatCatalogShowLabel } from './catalog-panel.helpers';

/** One group of selectable tags; a selected tag shows a check. */
function CatalogFilterGroup({ label, hint, options, selectedKeys, selectionMode, onSelectionChange }: Readonly<CatalogFilterGroupProps>) {
  return (
    <TagGroup
      className="flex flex-col gap-2"
      disallowEmptySelection={selectionMode === 'single'}
      selectedKeys={selectedKeys}
      selectionMode={selectionMode}
      size="md"
      onSelectionChange={onSelectionChange}
    >
      <Label className="text-sm font-semibold">{label}</Label>
      {hint === undefined ? null : <Description className="-mt-1 text-xs">{hint}</Description>}
      <TagGroup.List className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Tag className="group/tag" id={option.value} key={option.value} textValue={option.label}>
            <Icon aria-hidden="true" className="hidden size-3.5 group-data-[selected=true]/tag:inline-block" icon={checkIcon} />
            {option.label}
          </Tag>
        ))}
      </TagGroup.List>
    </TagGroup>
  );
}

/** Status, Type and Genres tag groups, with reset and the "Show N anime" close action. */
export function CatalogFilters({ state }: Readonly<CatalogSectionProps>) {
  return (
    <div className="flex flex-col gap-3">
      <CatalogFilterGroup label="Status" options={state.statusOptions} selectedKeys={[state.criteria.status]} selectionMode="single" onSelectionChange={state.onStatusSelectionChange} />
      <Separator />
      <CatalogFilterGroup label="Type" options={state.kindOptions} selectedKeys={[state.criteria.kind]} selectionMode="single" onSelectionChange={state.onKindSelectionChange} />
      <Separator />
      <CatalogFilterGroup hint={CATALOG_GENRES_HINT} label="Genres" options={state.genreOptions} selectedKeys={state.criteria.genres} selectionMode="multiple" onSelectionChange={state.onGenresSelectionChange} />
      <Separator />
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="tertiary" onPress={state.onFiltersReset}>Reset filters</Button>
        <Button size="sm" slot="close" variant="primary">{formatCatalogShowLabel(state.matchingCount)}</Button>
      </div>
    </div>
  );
}
