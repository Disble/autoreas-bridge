import { Label, ListBox, Select } from '@heroui/react';
import { coerceLabeledSelectValue, coerceLabeledSelectValues } from './LabeledSelect.helpers';
import { LabeledSelectOptions } from './LabeledSelectOptions';
import type { LabeledSelectProps } from './LabeledSelect.types';

/**
 * Renders the shared HeroUI Select/Label/ListBox scaffold used by feature-level filters.
 */
export function LabeledSelect(props: Readonly<LabeledSelectProps>) {
  if (props.selectionMode === 'multiple') {
    return (
      <Select
        aria-label={props.ariaLabel}
        className={props.className}
        placeholder={props.placeholder}
        selectionMode="multiple"
        value={props.value}
        onChange={(value) => props.onChange(coerceLabeledSelectValues(value))}
      >
        <Label>{props.label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox selectionMode="multiple">
            <LabeledSelectOptions options={props.options} />
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  return (
    <Select
      aria-label={props.ariaLabel}
      className={props.className}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(value) => props.onChange(coerceLabeledSelectValue(value, props.fallbackValue))}
    >
      <Label>{props.label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <LabeledSelectOptions options={props.options} />
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
