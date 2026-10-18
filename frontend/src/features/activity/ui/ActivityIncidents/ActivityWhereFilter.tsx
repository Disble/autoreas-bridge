import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { ACTIVITY_WHERE_OPTIONS } from '../../activity-source/activity-source.constants';
import type { ActivityWhereFilterProps } from './activity-incidents.types';

/** The "where it happened" filter: one single-select toggle row that never goes empty. */
export function ActivityWhereFilter({ where, onChange }: ActivityWhereFilterProps) {
  return (
    <ToggleButtonGroup aria-label="Where it happened" className="flex-wrap" disallowEmptySelection onSelectionChange={onChange} selectedKeys={[where]} selectionMode="single" size="sm">
      {ACTIVITY_WHERE_OPTIONS.map((option) => (
        <ToggleButton id={option.id} key={option.id}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
