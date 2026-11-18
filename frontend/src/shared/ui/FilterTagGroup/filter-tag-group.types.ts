import type { Selection } from '@heroui/react';
import type { ReactNode } from 'react';
import type { LabeledSelectOption } from '../LabeledSelect.types';

/** Props for one multiple-choice filter tag group inside a Filters popover. */
export interface FilterTagGroupProps {
  readonly label: string;
  /** Short help line under the label. */
  readonly hint?: string;
  readonly options: readonly LabeledSelectOption[];
  readonly selectedKeys: readonly string[];
  readonly onSelectionChange: (selection: Selection) => void;
}

/** Props for the Filters button and the popover that holds a screen's filter groups. */
export interface FiltersPopoverProps {
  /** Picked filter values, shown as a count on the button. */
  readonly activeFilterCount: number;
  /** The filter groups and actions the popover holds. */
  readonly children: ReactNode;
}
