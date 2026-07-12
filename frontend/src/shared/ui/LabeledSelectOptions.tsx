import { ListBox } from '@heroui/react';
import type { LabeledSelectOptionsProps } from './LabeledSelect.types';

/**
 * Renders option items for the shared labeled select scaffold.
 */
export function LabeledSelectOptions(props: Readonly<LabeledSelectOptionsProps>) {
  return props.options.map((option) => (
    <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
      {option.label}
      <ListBox.ItemIndicator />
    </ListBox.Item>
  ));
}
