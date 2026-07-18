import type { CheckboxProps } from '@heroui/react';
import type { ReactNode } from 'react';

/**
 * Props for the reusable labeled checkbox primitive.
 *
 * The interface combines the underlying HeroUI `Checkbox` props (so every
 * valid Aria/HTML attribute is still accepted and forwarded to the rendered
 * `<Checkbox>`) with this component's unique contract: a boolean-only
 * `isSelected`/`onChange` surface and a required `children` (the label text).
 * `onChange` receives a plain `boolean`; callers do not need to deal with the
 * indeterminate/array modes of the raw Aria checkbox.
 */
export interface LabeledCheckboxProps
  extends Omit<CheckboxProps, 'isSelected' | 'onChange' | 'children' | 'isDisabled'> {
  /** Whether the checkbox is currently selected. */
  readonly isSelected: boolean;
  /** Called with a plain boolean whenever selection toggles. */
  readonly onChange: (isSelected: boolean) => void;
  /** The checkbox label content. */
  readonly children: ReactNode;
  /** Shown but non-interactive when true (e.g. a row not yet eligible to pick). */
  readonly isDisabled?: boolean;
}
