import { ListBox } from '@heroui/react';
import type { LabeledSelectOptionsProps } from './LabeledSelect.types';

/**
 * Renders option items for the shared labeled select scaffold. Every inherited
 * HeroUI `ListBox.Item` prop is forwarded to each rendered item, so callers can
 * pass shared Aria/HTML attributes (e.g. `className`, `isDisabled`) without
 * re-implementing the loop. `id`, `textValue`, and `children` are owned by this
 * wrapper because they are derived from each `LabeledSelectOption`.
 */
export function LabeledSelectOptions({ options, ...rest }: Readonly<LabeledSelectOptionsProps>) {
  return options.map((option) => (
    <ListBox.Item key={option.value} id={option.value} textValue={option.label} {...rest}>
      {option.label}
      <ListBox.ItemIndicator />
    </ListBox.Item>
  ));
}
