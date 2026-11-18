import sortIcon from '@iconify-icons/tabler/arrows-sort';
import { Icon } from '@iconify/react';
import { ListBox, SearchField, Select, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react';
import { FiltersPopover } from '../../../../shared/ui/FilterTagGroup/FiltersPopover';
import { CatalogFilters } from './CatalogFilters';
import { CATALOG_VIEW_OPTIONS } from './catalog-panel.constants';
import type { CatalogSectionProps } from './catalog-panel.types';

/** Search, the Filters popover, the sort select and the grid/list toggle, in one wrapping row. */
export function CatalogToolbar({ state }: Readonly<CatalogSectionProps>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchField aria-label="Search animes" className="min-w-0 flex-[1_1_20rem]" value={state.criteria.query} variant="secondary" onChange={state.onQueryChange}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search by name…" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <FiltersPopover activeFilterCount={state.activeFilterCount}>
        <CatalogFilters state={state} />
      </FiltersPopover>

      <Select aria-label="Sort by" className="w-44 max-sm:flex-1" value={state.sort} variant="secondary" onChange={state.onSortChange}>
        <Select.Trigger className="items-center gap-2">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" icon={sortIcon} />
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {state.sortOptions.map((option) => (
              <ListBox.Item id={option.value} key={option.value} textValue={option.label}>{option.label}</ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <ToggleButtonGroup aria-label="View" disallowEmptySelection selectedKeys={[state.view]} selectionMode="single" onSelectionChange={state.onViewSelectionChange}>
        {CATALOG_VIEW_OPTIONS.map((option) => (
          <Tooltip delay={300} key={option.value}>
            <ToggleButton aria-label={option.label} id={option.value} isIconOnly>
              <Icon aria-hidden="true" className="size-4" icon={option.icon} />
            </ToggleButton>
            <Tooltip.Content>{option.label}</Tooltip.Content>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
