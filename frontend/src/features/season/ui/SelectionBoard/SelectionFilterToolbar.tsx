import adjustmentsIcon from '@iconify-icons/tabler/adjustments-horizontal';
import checkIcon from '@iconify-icons/tabler/check';
import sortIcon from '@iconify-icons/tabler/arrows-sort';
import { Icon } from '@iconify/react';
import { Button, Chip, CloseButton, Label, ListBox, Popover, Select, Separator, Tag, TagGroup, Typography } from '@heroui/react';
import {
  SELECTION_FILTERS_HEADING,
  SELECTION_FILTERS_LABEL,
  SELECTION_FILTERS_RESET_LABEL,
  SELECTION_VIEW_RESET_LABEL,
} from './selection-board.constants';
import {
  formatSelectionFiltersLabel,
  formatSelectionShowLabel,
  formatSelectionVisibleCount,
  hasSelectionViewCriteria,
  toSelectionFilterTagKeys,
  toSelectionFilterValues,
} from './selection-view.helpers';
import type { SelectionFilterKey, SelectionFilterToolbarProps, SelectionSort } from './selection-board.types';

/** One dimension's multi-select tag group; All is the sentinel for an unrestricted group. */
function FilterGroup({
  groupKey,
  label,
  options,
  selectedValues,
  onGroupChange,
}: Readonly<{
  groupKey: SelectionFilterKey;
  label: string;
  options: SelectionFilterToolbarProps['groups'][number]['options'];
  selectedValues: readonly string[];
  onGroupChange: SelectionFilterToolbarProps['onGroupChange'];
}>) {
  return (
    <TagGroup
      className="flex flex-col gap-2"
      selectedKeys={toSelectionFilterTagKeys(selectedValues)}
      selectionMode="multiple"
      size="md"
      onSelectionChange={(keys) => onGroupChange(groupKey, toSelectionFilterValues(keys as Set<string>, selectedValues))}
    >
      <Label className="text-sm font-semibold">{label}</Label>
      <TagGroup.List className="flex flex-wrap gap-2">
        <Tag className="group/tag" id="all" textValue="All">
          <Icon aria-hidden="true" className="hidden size-3.5 group-data-[selected=true]/tag:inline-block" icon={checkIcon} />
          All
        </Tag>
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

/**
 * SelectionFilterToolbar is the Selection view's filter bar: a Filters popover with
 * one multi-select tag group per dimension (grade, verdict, consideration), and a
 * separate sort Select. Below them, a persistent summary keeps the criteria in force
 * legible, next to the visible/total count and one reset. Filtering is instant: the
 * popover footer only closes the panel. All view state and derivation belong to the
 * board's hook; this component renders and reports.
 */
export function SelectionFilterToolbar({
  criteria,
  groups,
  sortOptions,
  summaryOptions,
  activeFilterCount,
  matchingCount,
  totalCount,
  onGroupChange,
  onResetFilters,
  onResetView,
  onSortChange,
}: Readonly<SelectionFilterToolbarProps>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <Button aria-label={formatSelectionFiltersLabel(activeFilterCount)} variant="tertiary">
            <Icon aria-hidden="true" className="size-4" icon={adjustmentsIcon} />
            {SELECTION_FILTERS_LABEL}
            {activeFilterCount > 0 ? (
              <Chip aria-hidden="true" color="accent" size="sm" variant="soft">
                <Chip.Label>{activeFilterCount}</Chip.Label>
              </Chip>
            ) : null}
          </Button>
          <Popover.Content className="w-[min(26rem,calc(100vw-2rem))]" placement="bottom start">
            <Popover.Dialog aria-label={SELECTION_FILTERS_HEADING} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Typography type="h6">{SELECTION_FILTERS_HEADING}</Typography>
                <CloseButton aria-label="Close filters" slot="close" />
              </div>
              {groups.map((group, index) => (
                <div className="flex flex-col gap-3" key={group.key}>
                  {index > 0 ? <Separator /> : null}
                  <FilterGroup
                    groupKey={group.key}
                    label={group.label}
                    options={group.options}
                    selectedValues={criteria[group.key] as readonly string[]}
                    onGroupChange={onGroupChange}
                  />
                </div>
              ))}
              <Separator />
              <div className="flex justify-between gap-2">
                <Button size="sm" variant="tertiary" onPress={onResetFilters}>
                  {SELECTION_FILTERS_RESET_LABEL}
                </Button>
                <Button size="sm" slot="close" variant="primary">
                  {formatSelectionShowLabel(matchingCount)}
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        <Select aria-label="Sort by" className="w-44 max-sm:flex-1" value={criteria.sort} variant="secondary" onChange={(value) => onSortChange(value as SelectionSort)}>
          <Select.Trigger>
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" icon={sortIcon} />
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {sortOptions.map((option) => (
                <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-separator pt-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-2">
          {summaryOptions.map((entry) => (
            <span className="inline-flex items-baseline gap-1.5" key={entry.label}>
              <span className="text-muted">{entry.label}</span>
              <span className="font-medium text-foreground">{entry.value}</span>
            </span>
          ))}
        </div>
        <span aria-atomic="true" aria-live="polite" className="ml-auto tabular-nums text-muted" role="status">
          {formatSelectionVisibleCount(matchingCount, totalCount)}
        </span>
        <Button isDisabled={!hasSelectionViewCriteria(criteria)} size="sm" variant="tertiary" onPress={onResetView}>
          {SELECTION_VIEW_RESET_LABEL}
        </Button>
      </div>
    </div>
  );
}
