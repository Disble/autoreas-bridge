import type { ListBoxItemProps, SelectProps } from '@heroui/react';

/** A single option rendered by the reusable labeled select primitive. */
export interface LabeledSelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Base props for the reusable labeled select scaffold. Combines the underlying
 * HeroUI `Select` props (parameterized by the option type `T` and the selection
 * mode `M`, so every valid Aria/HTML attribute is still accepted and forwarded
 * to the rendered `<Select>`) with this component's unique contract: a required
 * `ariaLabel`, `label`, `options`, and `placeholder`, plus a `variant` knob.
 *
 * `value`/`onChange`/`selectionMode` are narrowed by the single/multiple
 * variants below; the HeroUI `items`, `children`, and `placeholder` props are
 * omitted because this wrapper owns the option list and the Label/Trigger
 * composition.
 */
interface LabeledSelectBaseProps<M extends 'single' | 'multiple'>
  extends Omit<
    SelectProps<LabeledSelectOption, M>,
    'value' | 'onChange' | 'selectionMode' | 'children' | 'items' | 'placeholder' | 'aria-label' | 'label'
  > {
  /** Accessible name forwarded to the HeroUI Select as `aria-label`. */
  readonly ariaLabel: string;
  /** Visible text rendered inside the HeroUI Label. */
  readonly label: string;
  /** Options rendered inside the HeroUI ListBox. */
  readonly options: readonly LabeledSelectOption[];
  /** Placeholder shown when no value is selected. */
  readonly placeholder: string;
  /** Visual variant forwarded to the HeroUI Select. */
  readonly variant?: 'primary' | 'secondary';
}

/** Props for single-value labeled selects. */
export interface SingleLabeledSelectProps extends LabeledSelectBaseProps<'single'> {
  /** Value used when the coerced selection is empty. */
  readonly fallbackValue: string;
  /** Forces single selection mode. Defaults to `'single'`. */
  readonly selectionMode?: 'single';
  /** Currently selected option value. */
  readonly value: string;
  /** Called with the coerced string value (or `fallbackValue`) on change. */
  readonly onChange: (value: string) => void;
}

/** Props for multiple-value labeled selects. */
export interface MultipleLabeledSelectProps extends LabeledSelectBaseProps<'multiple'> {
  /** Forces multiple selection mode. */
  readonly selectionMode: 'multiple';
  /** Currently selected option values. */
  readonly value: readonly string[];
  /** Called with the coerced string array on change. */
  readonly onChange: (value: readonly string[]) => void;
}

/** Props for the reusable HeroUI labeled select scaffold. */
export type LabeledSelectProps = SingleLabeledSelectProps | MultipleLabeledSelectProps;

/** Props for rendering a select option list inside a HeroUI ListBox. */
export interface LabeledSelectOptionsProps
  extends Omit<ListBoxItemProps, 'id' | 'textValue' | 'children'> {
  /** Options to render, one HeroUI `ListBox.Item` per entry. */
  readonly options: readonly LabeledSelectOption[];
}
