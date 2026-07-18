import { Label, ListBox, Select } from '@heroui/react';
import { coerceLabeledSelectValue, coerceLabeledSelectValues } from './LabeledSelect.helpers';
import { LabeledSelectOptions } from './LabeledSelectOptions';
import type { LabeledSelectProps } from './LabeledSelect.types';

/**
 * Renders the shared HeroUI Select/Label/ListBox scaffold used by feature-level filters.
 */
export function LabeledSelect(props: Readonly<LabeledSelectProps>) {
  if (props.selectionMode === 'multiple') {
    const { ariaLabel, className, label, options, placeholder, variant, value, onChange, ...rest } = props;
    return (
      <Select
        {...rest}
        aria-label={ariaLabel}
        className={className}
        placeholder={placeholder}
        selectionMode="multiple"
        variant={variant}
        value={value}
        onChange={(selectValue) => onChange(coerceLabeledSelectValues(selectValue))}
      >
        <Label>{label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox selectionMode="multiple">
            <LabeledSelectOptions options={options} />
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  const { ariaLabel, className, label, options, placeholder, variant, value, onChange, fallbackValue, ...rest } = props;
  return (
    <Select
      {...rest}
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={value}
      variant={variant}
      onChange={(selectValue) => onChange(coerceLabeledSelectValue(selectValue, fallbackValue))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <LabeledSelectOptions options={options} />
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
