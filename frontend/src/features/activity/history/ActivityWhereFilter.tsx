import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { ACTIVITY_WHERE_OPTIONS } from './activity-history.constants';
import type { ActivityWhereFilterProps } from './activity-history.types';

/** The "where it happened" filter: one single-select toggle row. */
export function ActivityWhereFilter({ where, onWhereChange }: ActivityWhereFilterProps) {
  return (
    <ToggleButtonGroup
      aria-label="Where it happened"
      className="flex-wrap"
      disallowEmptySelection
      onSelectionChange={onWhereChange}
      selectedKeys={[where]}
      selectionMode="single"
      size="sm"
    >
      {ACTIVITY_WHERE_OPTIONS.map((option) => (
        <ToggleButton id={option.id} key={option.id}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
