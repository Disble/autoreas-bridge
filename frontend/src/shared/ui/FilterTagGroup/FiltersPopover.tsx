import adjustmentsIcon from '@iconify-icons/tabler/adjustments-horizontal';
import { Icon } from '@iconify/react';
import { Button, Chip, CloseButton, Popover, Typography } from '@heroui/react';
import { formatFiltersLabel } from './filter-tag-group.helpers';
import type { FiltersPopoverProps } from './filter-tag-group.types';

/** The Filters button, with the active-filter count, and the popover dialog that holds the filter groups. */
export function FiltersPopover({ activeFilterCount, children }: Readonly<FiltersPopoverProps>) {
  return (
    <Popover>
      <Button aria-label={formatFiltersLabel(activeFilterCount)} variant="secondary">
        <Icon aria-hidden="true" className="size-4" icon={adjustmentsIcon} />
        Filters
        {activeFilterCount > 0 ? (
          <Chip aria-hidden="true" color="accent" data-testid="filters-active-count" size="sm" variant="soft">
            <Chip.Label>{activeFilterCount}</Chip.Label>
          </Chip>
        ) : null}
      </Button>
      <Popover.Content className="w-[min(26rem,calc(100vw-2rem))]" placement="bottom end">
        <Popover.Dialog aria-label="Filters" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Typography type="h6">Filters</Typography>
            <CloseButton aria-label="Close filters" slot="close" />
          </div>
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
